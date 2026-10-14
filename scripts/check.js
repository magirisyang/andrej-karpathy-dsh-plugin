import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
for (const directory of ['src','integration']) {
  const root = new URL(`../${directory}/`,import.meta.url);
  for (const filename of await readdir(root)) {
    if (!/\.[cm]?js$/.test(filename)) continue;
    const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL(filename,root))],{stdio:'inherit'});
    if (result.status!==0) process.exit(result.status??1);
  }
}
console.log('All plugin JavaScript sources parse successfully.');
