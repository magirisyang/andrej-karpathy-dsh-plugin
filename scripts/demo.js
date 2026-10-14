import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildArtifacts } from '../src/render.js';
const input = JSON.parse(await readFile(new URL('../examples/random-forest.json', import.meta.url), 'utf8'));
const output = new URL('../.artifacts/demo/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [name, content] of Object.entries(buildArtifacts(input))) await writeFile(new URL(name, output), content);
console.log(output.pathname);
