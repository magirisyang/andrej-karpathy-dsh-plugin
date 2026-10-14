/** Runs in generated pages. Content is inserted via textContent, never evaluated. */
export function pageRuntime(spatialModel, spatialSvg) {
  const data = JSON.parse(document.getElementById('explanation-data').textContent);
  const status = document.getElementById('status');
  document.getElementById('search')?.addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase();
    let visible = 0;
    document.querySelectorAll('.point').forEach(card => {
      card.hidden = !card.textContent.toLocaleLowerCase().includes(query);
      if (!card.hidden) visible++;
    });
    status.textContent = visible ? `显示 ${visible} 条要点` : '没有匹配的要点';
  });
  document.querySelectorAll('[data-expand]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('details').forEach(item => { item.open = button.dataset.expand === 'true'; });
  }));
  document.getElementById('print')?.addEventListener('click', () => window.print());
  const simulationRoot = document.getElementById('spatial-plot');
  if (simulationRoot && data.simulation) {
    const grid = document.getElementById('grid-size'), fold = document.getElementById('holdout-fold');
    const metrics = document.getElementById('spatial-metrics'), gridLabel = document.getElementById('grid-value');
    const recalculate = () => {
      const result = spatialModel({ ...data.simulation, gridSize: Number(grid.value), holdoutFold: Number(fold.value) });
      // Trusted fixed renderer; no model-authored HTML is evaluated.
      simulationRoot.innerHTML = spatialSvg(result);
      gridLabel.textContent = grid.value;
      metrics.textContent = result.accuracy === null ? '此划分没有足够的训练或验证样本，不能计算准确率。' :
        `训练 ${result.train.length} · 验证 ${result.validation.length} · 模拟最近邻准确率 ${(result.accuracy * 100).toFixed(1)}% · 验证点到最近训练点的平均距离 ${result.meanNearestDistance.toFixed(2)}`;
    };
    grid.addEventListener('input', recalculate); fold.addEventListener('change', recalculate); recalculate();
  }
  const canvas = document.getElementById('film');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // Paginate long text so the exported video retains every character.
  const extra = [
    ...data.facts.map(f => ({ title: { source_stated: '资料所述', inference: '推断', assumption: '假设', unverified: '未核验' }[f.status], detail: f.statement })),
    ...(data.scope ? [{ title: '适用范围', detail: data.scope }] : []),
    ...data.unknowns.map(detail => ({ title: '待确认', detail })),
    ...data.sources.map(source => ({ title: '来源：' + source.label, detail: source.reference })),
  ];
  const scenes = [{ title: data.title, detail: data.summary }, ...data.points, ...extra].flatMap(scene => {
    const chars = [...scene.detail], pages = [];
    for (let i = 0; i < chars.length; i += 180) pages.push(chars.slice(i, i + 180).join(''));
    return pages.map((detail, i) => ({ title: scene.title + (pages.length > 1 ? ` (${i + 1}/${pages.length})` : ''), detail }));
  });
  const range = document.getElementById('position');
  const durationInput = document.getElementById('duration');
  const play = document.getElementById('play');
  const exportButton = document.getElementById('export-video');
  const cancel = document.getElementById('cancel-export');
  const caption = document.getElementById('caption');
  let playing = false, frame = 0, index = 0, sceneStart = 0, recording = false, recorder;
  range.max = scenes.length - 1;
  function wrapped(value, x, y, width, lineHeight, maxLines) {
    const lines = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (ctx.measureText(line + char).width > width && line) { lines.push(line); line = ''; }
        line += char;
      }
      lines.push(line);
    }
    lines.slice(0, maxLines).forEach((line, i) => {
      const last = i === maxLines - 1 && lines.length > maxLines;
      ctx.fillText(last ? line.slice(0, -1) + '…' : line, x, y + i * lineHeight);
    });
    return lines.length > maxLines;
  }
  function draw(progress = 0) {
    const scene = scenes[index];
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#5eead4'; ctx.font = '24px sans-serif';
    ctx.fillText('理解模型输出  /  ' + String(index + 1).padStart(2, '0'), 72, 72);
    ctx.fillStyle = '#f8fafc';
    let fontSize = 42;
    do { ctx.font = `bold ${fontSize}px sans-serif`; if (ctx.measureText(scene.title).width <= 2200) break; fontSize--; } while (fontSize > 22);
    wrapped(scene.title, 72, 155, 1136, 54, 2);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '30px sans-serif';
    const cropped = wrapped(scene.detail, 72, 280, 1136, 45, 8);
    ctx.fillStyle = '#334155'; ctx.fillRect(72, 660, 1136, 5);
    ctx.fillStyle = '#5eead4'; ctx.fillRect(72, 660, 1136 * ((index + progress) / scenes.length), 5);
    range.value = index;
    caption.textContent = scene.title + '：' + scene.detail;
    status.textContent = `${index + 1} / ${scenes.length}` + (cropped ? ' · 画面文字较长，完整内容见下方字幕' : '');
  }
  function stop() { playing = false; cancelAnimationFrame(frame); play.textContent = '播放'; }
  function tick(now) {
    if (!playing) return;
    const seconds = Number(durationInput.value);
    const progress = Math.min(1, (now - sceneStart) / (seconds * 1000));
    draw(progress);
    if (progress >= 1) {
      if (index === scenes.length - 1) {
        stop(); if (recording && recorder.state === 'recording') recorder.stop(); return;
      }
      index++; sceneStart = now;
    }
    frame = requestAnimationFrame(tick);
  }
  function start() { playing = true; sceneStart = performance.now(); play.textContent = '暂停'; frame = requestAnimationFrame(tick); }
  play.addEventListener('click', () => { if (playing) stop(); else { if (index === scenes.length - 1) index = 0; start(); } });
  range.addEventListener('input', () => { stop(); index = Number(range.value); draw(); });
  document.getElementById('restart').addEventListener('click', () => { stop(); index = 0; draw(); });
  cancel.addEventListener('click', () => { stop(); if (recorder?.state === 'recording') recorder.stop(); });
  exportButton.addEventListener('click', async () => {
    if (recording) return;
    if (!canvas.captureStream || !window.MediaRecorder) { status.textContent = '此浏览器不支持视频导出，请使用新版 Chrome 或 Edge。'; return; }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { status.textContent = '浏览器缺少 WebM 编码器。'; return; }
    stop(); index = 0; draw();
    const stream = canvas.captureStream(30), chunks = [];
    const controls = [play, range, durationInput, document.getElementById('restart'), exportButton];
    function cleanup() {
      stream.getTracks().forEach(track => track.stop()); recording = false;
      controls.forEach(control => { control.disabled = false; }); cancel.hidden = true;
    }
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { stop(); cleanup(); status.textContent = '视频导出失败，请重试。'; };
      recorder.onstop = () => {
        cleanup();
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mimeType }), url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'explanation.webm'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status.textContent = '视频已导出（无音轨）；提前停止会保存已录制部分。';
      };
      recording = true; controls.forEach(control => { control.disabled = true; }); cancel.hidden = false;
      recorder.start(200); start();
    } catch (error) { cleanup(); status.textContent = '视频导出失败：' + error.message; }
  });
  window.addEventListener('pagehide', () => { stop(); if (recorder?.state === 'recording') recorder.stop(); });
  draw();
}
