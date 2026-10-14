import { createHash } from 'node:crypto';
export const hashContent = content => createHash('sha256').update(content).digest('hex');

export function artifactPathAllowed(path, root) {
  return typeof path === 'string' && new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/[a-f0-9]{24}/[a-z][a-z0-9.-]*$`).test(path);
}

export async function readExisting(ctx, path, cwd, signal) {
  const target = await ctx.fs.resolve(path, { cwd, signal });
  const info = await ctx.fs.stat(target, signal);
  if (!info) return undefined;
  if (info.type !== 'file') throw new Error('Artifact path is not a regular file');
  if (info.size > 1000000) throw new Error('Existing artifact exceeds the cache read limit');
  return ctx.fs.readText(target, signal, 1000000);
}

/** Reuse only content whose current bytes match both the manifest and new stage output. */
export async function selectInherited(ctx, files, reuseFrom, root, cwd, signal) {
  if (!reuseFrom) return {};
  if (!new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/[a-f0-9]{24}$`).test(reuseFrom)) throw new Error('reuseFrom must name a previous generated package in outputDirectory');
  const raw = await readExisting(ctx, `${reuseFrom}/manifest.json`, cwd, signal);
  if (!raw) throw new Error('reuseFrom manifest does not exist');
  const manifest = JSON.parse(raw), inherited = {};
  if (manifest.formatVersion !== 2 || !manifest.files) throw new Error('Unsupported reuse manifest');
  for (const [filename, content] of Object.entries(files)) {
    // Pages depend on links to all other stages and are built after path selection.
    if (filename.endsWith('.html') || filename.endsWith('.py') || filename.endsWith('.ps1') || filename === 'requirements-video.txt') continue;
    const previous = manifest.files[filename];
    if (!previous || !artifactPathAllowed(previous.path, root) || previous.hash !== hashContent(content)) continue;
    if (await readExisting(ctx, previous.path, cwd, signal) === content) inherited[filename] = previous.path;
  }
  return inherited;
}

export async function createOrReuse(ctx, path, content, cwd, exec, sandboxPolicy) {
  const existing = await readExisting(ctx, path, cwd, exec.signal);
  if (existing !== undefined) {
    if (existing !== content) throw new Error(`Existing artifact differs from its content-addressed version: ${path}; original preserved.`);
    return true;
  }
  const target = await ctx.fs.resolve(path, { cwd, signal: exec.signal });
  try {
    const outcome = await ctx.fs.writeText(target, content, { kind: 'createIfAbsent' }, exec.signal, sandboxPolicy);
    ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec);
    return false;
  } catch (error) {
    if (error.code === 'FS_NOT_OBSERVED' && await readExisting(ctx, path, cwd, exec.signal) === content) return true;
    throw error;
  }
}
