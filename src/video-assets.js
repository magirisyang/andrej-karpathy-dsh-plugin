import { readFileSync } from 'node:fs';
// Only read fixed resources shipped inside this plugin, never model-supplied paths.
export const videoAssets = Object.fromEntries([
  ['render-video.py', '../video/render.py'],
  ['narrate.py', '../video/narrate.py'],
  ['requirements-video.txt', '../video/requirements.txt'],
].map(([filename, resource]) => [filename, readFileSync(new URL(resource, import.meta.url), 'utf8')]));
