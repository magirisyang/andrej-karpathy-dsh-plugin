import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apply, Config } from '../src/index.js';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
const data = JSON.parse(await readFile(new URL('../examples/random-forest.json', import.meta.url), 'utf8'));

function fixture({ sandboxed = false, policy } = {}) {
  let tool, section;
  const writes = [];
  const stored = new Map();
  const ctx = {
    get: key => key === 'sandboxPolicy' ? policy : undefined,
    systemPrompt: { section: value => { section = value; } },
    tools: { register: value => { tool = value; }, get: () => tool },
    fs: {
      sandboxMode: sandboxed ? 'workspace-write' : undefined,
      resolve: async (path, options) => ({ displayPath: path, options }),
      stat: async target => stored.has(target.displayPath) ? { type: 'file', size: Buffer.byteLength(stored.get(target.displayPath)) } : undefined,
      readText: async target => stored.get(target.displayPath),
      writeText: async (...args) => { writes.push(args); stored.set(args[0].displayPath,args[1]); return { version: 'test-version' }; },
    },
    emit() {},
  };
  return { ctx, writes, get tool() { return tool; }, get section() { return section; } };
}
test('actual DSH defineTool accepts the plugin schema and output', async () => {
  const f = fixture(); apply(f.ctx, Config({}));
  const args = { explanation: data, mode: 'html' };
  assert.deepEqual(validateJsonSchemaValue(f.tool.parameters, args), []);
  const result = await f.tool.execute(args, { signal: new AbortController().signal, agent: { session: { header: { cwd: '/workspace' } } } });
  assert.deepEqual(validateJsonSchemaValue(f.tool.output.schema, result), []);
  assert.equal(f.writes.length, 6);
  assert.ok(result.preferredPath.endsWith('/index.html'));
  assert.ok(f.writes.every(write => write[2].kind === 'createIfAbsent'));
  assert.ok(f.writes.every(write => write[0].options.cwd === '/workspace'));
});
test('standing sandbox policy is carried into each provider mutation', async () => {
  const standing = { mode: 'read-only', workspaceRoot: '/workspace' };
  const f = fixture({ sandboxed: true, policy: { resolve: () => standing } }); apply(f.ctx);
  await f.tool.execute({ explanation: data }, { signal: new AbortController().signal, agent: { session: { header: { cwd: '/workspace' } } } });
  assert.ok(f.writes.every(write => write[4] === standing));
  assert.throws(() => apply(fixture({ sandboxed: true }).ctx), /requires sandboxPolicy/);
});
test('cancellation, invalid input and missing workspace perform no writes', async () => {
  const f = fixture(); apply(f.ctx);
  await assert.rejects(() => f.tool.execute({ explanation: data }, { signal: AbortSignal.abort() }), /abort/i);
  await assert.rejects(() => f.tool.execute({ explanation: data }, { signal: new AbortController().signal }), /working directory/);
  await assert.rejects(() => f.tool.execute({ explanation: { ...data, points: [] } }, { signal: new AbortController().signal }), /at least one/);
  assert.equal(f.writes.length, 0);
  assert.throws(() => apply(f.ctx, { outputDirectory: '../outside' }), /safe path/);
});
test('default creates text only; repeat reuses all files without new writes', async () => {
  const f = fixture(); apply(f.ctx);
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: '/workspace' } } } };
  const first = await f.tool.execute({ explanation: data }, exec);
  assert.equal(first.mode,'text');
  assert.ok(first.files.every(path => !/\.(html|svg)$/.test(path)));
  const writes = f.writes.length;
  const second = await f.tool.execute({ explanation: data }, exec);
  assert.equal(f.writes.length,writes);
  assert.deepEqual(first.files,second.files);
  assert.equal(second.reusedFiles.length,3);
});
test('revision reuses identical diagram bytes and preserves the old version', async () => {
  const f = fixture(); apply(f.ctx);
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: '/workspace' } } } };
  const first = await f.tool.execute({ explanation:data,mode:'html' },exec);
  const directory = first.manifestPath.replace('/manifest.json','');
  const second = await f.tool.execute({ explanation:{...data,summary:data.summary+'新增说明。'},mode:'html',reuseFrom:directory },exec);
  const oldSvg = first.files.find(path => path.endsWith('/diagram.svg'));
  assert.ok(second.reusedFiles.includes(oldSvg));
  const page = f.writes.find(w => w[0].displayPath === second.preferredPath)[1];
  assert.ok(page.includes('../'+directory.split('/').at(-1)+'/diagram.svg'));
  await assert.rejects(() => f.tool.execute({ explanation:data,reuseFrom:'../outside' },exec),/reuseFrom/);
});
