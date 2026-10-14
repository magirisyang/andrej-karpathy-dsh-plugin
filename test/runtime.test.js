import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import FileSystem from '@deepseek-ai/dsh-fs-local';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import * as plugin from '../src/index.js';
const data = JSON.parse(await readFile(new URL('../examples/random-forest.json', import.meta.url), 'utf8'));

test('Cordis mounts/unmounts the plugin and real DSH fs creates deliverables', async () => {
  await mkdir('.artifacts', { recursive: true });
  const ctx = new Context(), fibers = [];
  try {
    for (const service of [SystemPrompt, Tools, FileSystem]) {
      const fiber = ctx.plugin(service); fibers.push(fiber); await fiber.await();
    }
    const mounted = ctx.plugin(plugin, { outputDirectory: 'test-output' });
    fibers.push(mounted); await mounted.await();
    const tool = ctx.tools.get('karpathy_explain');
    assert.ok(tool);
    const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: process.cwd() } } } };
    const result = await tool.execute({ explanation: data, mode: 'video' }, exec);
    assert.ok(result.preferredPath.endsWith('/video.html'));
    const content = await readFile(result.preferredPath, 'utf8');
    assert.ok(content.includes(data.title));
    const target = await ctx.fs.resolve(result.preferredPath, { cwd: process.cwd() });
    await assert.rejects(() => ctx.fs.writeText(target, 'overwrite', { kind: 'createIfAbsent' }, exec.signal), /overwrite/);
    assert.equal(await readFile(result.preferredPath, 'utf8'), content);
    await mounted.dispose();
    fibers.pop();
    assert.equal(ctx.tools.get('karpathy_explain'), undefined);
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose();
  }
});
