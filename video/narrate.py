"""Use the installed Windows SAPI voice without changing PowerShell policy."""
import argparse
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--dependency-dir')
args = parser.parse_args()
if args.dependency_dir:
    sys.path.insert(0, str(Path(args.dependency_dir).resolve()))
from comtypes.client import CreateObject
payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
if len(payload['text']) > 2000:
    raise ValueError('Narration scene is too long')
voice = CreateObject('SAPI.SpVoice', dynamic=True)
voices = voice.GetVoices()
selected = None
for i in range(voices.Count):
    token = voices.Item(i)
    if token.GetDescription() == payload['voice']:
        selected = token
        break
if selected is None:
    raise RuntimeError('Configured offline Chinese voice is unavailable')
voice.Voice = selected
voice.Rate = payload['rate']
stream = CreateObject('SAPI.SpFileStream', dynamic=True)
stream.Format.Type = 22
try:
    stream.Open(str(Path(args.output).resolve()), 3, False)
    voice.AudioOutputStream = stream
    voice.Speak(payload['text'], 16)  # SPF_IS_NOT_XML
finally:
    stream.Close()
