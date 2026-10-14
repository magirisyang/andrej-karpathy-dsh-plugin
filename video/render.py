"""Windows offline Chinese narration + captioned MP4. No model/network calls.

Scene caches use renderer, font, voice settings, input and actual output hashes.
All subprocess commands use argv and never shell=True.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import wave

VERSION = 2
VOICE = "Microsoft Huihui Desktop - Chinese (Simplified)"


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode("utf-8")).hexdigest()


def file_hash(path):
    return digest(Path(path).read_bytes())


def run(argv, cwd=None, timeout=180):
    result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=timeout,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise RuntimeError(f"{Path(argv[0]).name} failed: {result.stderr[-3000:]}")
    return result.stdout


def scenes_from(data):
    scenes = [{"title": data["title"], "body": data["summary"]}]
    scenes += [{"title": p["title"], "body": p["detail"]} for p in data["points"]]
    labels = {"source_stated": "资料所述，未自动核验", "inference": "推断", "assumption": "假设", "unverified": "未核验"}
    scenes += [{"title": labels[f["status"]], "body": f["statement"]} for f in data.get("facts", [])]
    if data.get("scope"):
        scenes.append({"title": "适用范围", "body": data["scope"]})
    scenes += [{"title": "待确认", "body": text} for text in data.get("unknowns", [])]
    scenes += [{"title": "来源", "body": s["label"] + "。引用位置：" + s["reference"]} for s in data.get("sources", [])]
    pages = []
    for scene in scenes:
        # Preserve full content while avoiding unreadable slides.
        body = scene["body"]
        for offset in range(0, len(body), 180):
            pages.append({"title": scene["title"], "body": body[offset:offset + 180]})
    if len(pages) > 200:
        raise ValueError("Video exceeds 200 scenes; shorten or split the source")
    return pages


def lines_for(draw, text, font, width):
    lines, current = [], ""
    for char in text:
        if char == "\n":
            lines.append(current); current = ""; continue
        if current and draw.textlength(current + char, font=font) > width:
            lines.append(current); current = ""
        current += char
    lines.append(current)
    return lines


def draw_slide(scene, index, total, font_path, output):
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new("RGB", (1280, 720), "#0f172a")
    draw = ImageDraw.Draw(image)
    heading = ImageFont.truetype(str(font_path), 40)
    body = ImageFont.truetype(str(font_path), 30)
    small = ImageFont.truetype(str(font_path), 22)
    draw.text((70, 45), "中文讲解", font=small, fill="#5eead4")
    title_lines = lines_for(draw, scene["title"], heading, 1140)
    if len(title_lines) > 2:
        heading = ImageFont.truetype(str(font_path), 28)
        title_lines = lines_for(draw, scene["title"], heading, 1140)
    for line, value in enumerate(title_lines):
        draw.text((70, 105 + line * 48), value, font=heading, fill="#f8fafc")
    body_lines = lines_for(draw, scene["body"], body, 1140)
    if len(body_lines) > 8:
        raise ValueError("Scene has too many paragraph breaks; reduce paragraph breaks before rendering")
    for line, value in enumerate(body_lines):
        draw.text((70, 245 + line * 43), value, font=body, fill="#cbd5e1")
    draw.rectangle((70, 624, 1210, 628), fill="#334155")
    draw.rectangle((70, 624, 1210, 628), fill="#5eead4")
    image.save(output)


def timestamp(seconds):
    millis = round(seconds * 1000)
    return f"{millis // 3600000:02d}:{millis // 60000 % 60:02d}:{millis // 1000 % 60:02d},{millis % 1000:03d}"


def encoded_duration(ffmpeg, path):
    probe = subprocess.run([ffmpeg, '-hide_banner', '-i', str(path)], capture_output=True,
                           text=True, encoding='utf-8', errors='replace', timeout=20,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    match = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe.stderr)
    if not match:
        raise RuntimeError('Cannot determine encoded segment duration')
    hours, minutes, seconds = map(float, match.groups())
    return hours * 3600 + minutes * 60 + seconds


def render(args):
    if os.name != "nt":
        raise RuntimeError("Offline SAPI narration currently requires Windows; use the browser WebM exporter on other systems")
    if args.dependency_dir:
        sys.path.insert(0, str(Path(args.dependency_dir).resolve()))
    import PIL
    if args.ffmpeg:
        ffmpeg = str(Path(args.ffmpeg).resolve())
    else:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    knowledge = Path(args.knowledge).resolve()
    output = Path(args.output).resolve()
    work = Path(args.work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    font_path = Path(args.font or os.path.join(os.environ["WINDIR"], "Fonts", "msyh.ttc")).resolve()
    tts_script = Path(__file__).with_name("narrate.py")
    font_hash = file_hash(font_path)
    data = json.loads(knowledge.read_text(encoding="utf-8"))
    if len(knowledge.read_bytes()) > 100000 or not isinstance(data.get("points"), list):
        raise ValueError("Invalid or oversized knowledge file")
    scenes = scenes_from(data)
    dependency = {"version": VERSION, "renderer": file_hash(__file__), "tts": file_hash(tts_script),
                  "font": font_hash, "pillow": PIL.__version__, "voice": args.voice, "rate": args.rate,
                  "ffmpeg": run([ffmpeg, "-version"]).splitlines()[0]}
    identity = digest(json.dumps({"scenes": scenes, "dependencies": dependency}, sort_keys=True, ensure_ascii=False))
    release_manifest = output.with_suffix(".mp4.manifest.json")
    if output.exists():
        if release_manifest.exists():
            old = json.loads(release_manifest.read_text(encoding="utf-8"))
            if old.get("identity") == identity and old.get("hash") == file_hash(output):
                print(json.dumps({"path": str(output), "reused": True}, ensure_ascii=False), flush=True)
                return
        raise FileExistsError("Existing final video is preserved; choose another output path")
    parts, durations, segment_durations, reused = [], [], [], []
    for index, scene in enumerate(scenes):
        stage_id = digest(json.dumps({"scene": scene, "dependencies": dependency}, sort_keys=True, ensure_ascii=False))
        directory = work / stage_id
        directory.mkdir(exist_ok=True)
        manifest_path = directory / "scene.json"
        wav, png, part = directory / "audio.wav", directory / "slide.png", directory / "segment.mp4"
        cached = False
        if manifest_path.exists():
            previous = json.loads(manifest_path.read_text(encoding="utf-8"))
            cached = all(path.exists() and previous.get(path.name) == file_hash(path) for path in [wav, png, part])
        if not cached:
            print(f"Scene {index + 1}/{len(scenes)}: narration", flush=True)
            payload = directory / "narration.json"
            payload.write_text(json.dumps({"text": scene["title"] + "。" + scene["body"], "voice": args.voice, "rate": args.rate}, ensure_ascii=False), encoding="utf-8")
            narration_args = [sys.executable, str(tts_script), "--input", str(payload), "--output", str(wav)]
            if args.dependency_dir:
                narration_args += ["--dependency-dir", str(Path(args.dependency_dir).resolve())]
            run(narration_args, timeout=120)
            draw_slide(scene, index, len(scenes), font_path, png)
            print(f"Scene {index + 1}/{len(scenes)}: encode", flush=True)
            run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(png), "-i", str(wav),
                 "-vf", "fade=t=in:st=0:d=0.2", "-r", "12", "-c:v", "libx264", "-preset", "ultrafast",
                 "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(part)], timeout=180)
            manifest_path.write_text(json.dumps({path.name: file_hash(path) for path in [wav, png, part]}), encoding="utf-8")
        else:
            reused.append(index)
            print(f"Scene {index + 1}/{len(scenes)}: reused", flush=True)
        with wave.open(str(wav), "rb") as audio:
            durations.append(audio.getnframes() / audio.getframerate())
        parts.append(part)
        segment_durations.append(encoded_duration(ffmpeg, part))
    # Concat paths are escaped for FFmpeg's own text parser, not a shell.
    concat = work / "concat.txt"
    concat.write_text("".join("file '" + str(path).replace("\\", "/").replace("'", "'\\''") + "'\n" for path in parts), encoding="utf-8")
    subtitles, clock, counter = [], 0.0, 1
    for scene, duration, segment_duration in zip(scenes, durations, segment_durations):
        caption = scene["title"] + "。" + scene["body"]
        pieces = [caption[i:i + 32].replace("\n", " ") for i in range(0, len(caption), 32)]
        local = 0.0
        for piece in pieces:
            length = duration * len(piece) / len(caption)
            subtitles.append(f"{counter}\n{timestamp(clock + local)} --> {timestamp(clock + local + length)}\n{piece}\n")
            counter += 1; local += length
        # Frame quantization can leave a short quiet tail; next captions start at the actual segment boundary.
        clock += segment_duration
    srt = work / "subtitles.srt"
    srt.write_text("\n".join(subtitles), encoding="utf-8-sig")
    temporary = output.with_suffix(".partial.mp4")
    output.parent.mkdir(parents=True, exist_ok=True)
    print("Final composition: captioned MP4", flush=True)
    run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
         "-vf", "subtitles=subtitles.srt:force_style='FontName=Microsoft YaHei,FontSize=22,Alignment=2,MarginV=24'",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "copy", "-movflags", "+faststart", str(temporary)], cwd=work, timeout=300)
    temporary.replace(output)
    caption_output = output.with_suffix(".srt")
    caption_output.write_text(srt.read_text(encoding="utf-8-sig"), encoding="utf-8-sig")
    release_manifest.write_text(json.dumps({"identity": identity, "hash": file_hash(output), "seconds": clock,
                                           "dependencies": dependency, "reusedScenes": reused}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"path": str(output), "seconds": clock, "reusedScenes": reused}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--knowledge", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--work", required=True)
    parser.add_argument("--dependency-dir")
    parser.add_argument("--ffmpeg")
    parser.add_argument("--font")
    parser.add_argument("--voice", default=VOICE)
    parser.add_argument("--rate", type=int, choices=range(-3, 4), default=0)
    render(parser.parse_args())
