import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildArtifacts } from '../src/render.js';
import { validateExplanation } from '../src/model.js';
const data = JSON.parse(await readFile(new URL('../examples/random-forest.json', import.meta.url), 'utf8'));

test('all formats preserve source, uncertainty and every point', () => {
  const files = buildArtifacts(data);
  assert.equal(Object.keys(files).length, 9);
  for (const file of ['index.html', 'video.html', 'explanation.md']) {
    for (const point of data.points) assert.ok(files[file].includes(point.detail));
    assert.ok(files[file].includes(data.unknowns[0]));
    assert.ok(files[file].includes(data.sources[0].reference));
  }
  assert.deepEqual(JSON.parse(files['knowledge.json']), validateExplanation(data));
});
test('HTML/SVG cannot execute model-authored markup, script delimiters or unsafe links', () => {
  const attack = '</script><img src=x onerror=alert(1)>';
  const hostile = { ...data, title: attack, summary: attack, sources: [{ label: attack, reference: 'javascript:alert(1)' }] };
  const files = buildArtifacts(hostile);
  for (const file of ['index.html', 'video.html', 'diagram.svg']) {
    assert.ok(!files[file].includes(attack));
    assert.ok(!files[file].includes('href="javascript:'));
  }
  const payload = files['index.html'].match(/<script id="explanation-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(payload).title, attack);
  const script = files['index.html'].match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(script).digest('base64');
  assert.ok(files['index.html'].includes(`sha256-${hash}`));
});
test('invalid relation and oversized payload are rejected before rendering', () => {
  assert.throws(() => buildArtifacts({ ...data, edges: [{ from: 'missing', to: 'vote' }] }), /unknown node/);
  assert.throws(() => buildArtifacts({ ...data, nodes: [data.nodes[0], data.nodes[0]] }), /unique/);
  assert.throws(() => buildArtifacts({ ...data, summary: 'x'.repeat(2401) }), /2400/);
  assert.throws(() => buildArtifacts({ ...data, points: [] }), /at least one/);
});
test('no relationships are invented when the input lacks nodes', () => {
  const svg = buildArtifacts({ ...data, nodes: [], edges: [] })['diagram.svg'];
  assert.ok(svg.includes('排列不表示因果关系'));
  assert.ok(!svg.includes('marker-end='));
});
