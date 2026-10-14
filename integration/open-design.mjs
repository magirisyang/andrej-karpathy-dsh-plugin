// Runs only when the agent/user executes the returned command through DSH shell.
// Uses OpenDesign's official CLI so its import grants and authentication remain
// owned by OpenDesign. Importing is distinct from starting a design model run.
import { spawn } from 'node:child_process';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function cliInvocation(argv, { platform = process.platform, od = 'od' } = {}) {
  if (platform !== 'win32') return { executable: od, args: argv };
  // JSON values stay data even when the installed od entry is a .cmd shim.
  // No execution-policy override, string-built cmd command, or shell=True.
  const payload = JSON.stringify([od, ...argv]).replace(/'/g, "''");
  const ps = `$ErrorActionPreference='Stop'; $a=@(ConvertFrom-Json -InputObject '${payload}'); $bin=$a[0]; $rest=@($a | Select-Object -Skip 1); & $bin @rest; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
  return { executable: 'powershell.exe', args: ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')] };
}
export function runCli(argv, options = {}) {
  const { executable, args } = cliInvocation(argv, options);
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd: options.directory, windowsHide: true, shell: false, detached:process.platform !== 'win32' });
    let stdout = '', stderr = '';
    const stop=()=>{
      if(!child.pid)return;
      if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false}).on('error',()=>child.kill());
      else try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}
    };
    const timer = setTimeout(() => { stop(); fail(new Error('OpenDesign CLI timed out; inspect its project/run before retrying.')); }, options.timeoutMs ?? 120000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 2000000) { stop(); fail(new Error('OpenDesign output exceeded limit')); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
    child.on('error', error => { clearTimeout(timer); fail(new Error(`OpenDesign CLI unavailable: ${error.message}. Install/start OpenDesign and ensure od is on PATH.`)); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? done(stdout) : fail(new Error(`OpenDesign CLI exited ${code}: ${stderr}`)); });
  });
}
export function optionsFrom(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--design' || key === '--png') options[key.slice(2)] = true;
    else if (['--directory','--daemon-url','--od','--agent'].includes(key)) {
      if (!argv[i+1] || argv[i+1].startsWith('--')) throw new Error(`Missing value for ${key}`);
      options[key.slice(2)] = argv[++i];
    } else throw new Error(`Unknown option ${key}`);
  }
  if (options['daemon-url']) {
    const url = new URL(options['daemon-url']);
    if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('daemon-url must be an HTTP loopback origin');
  }
  return options;
}
export async function connect(options, cli = runCli) {
  const directory = resolve(options.directory ?? '.');
  await stat(join(directory,'index.html'));
  const data = JSON.parse(await readFile(join(directory,'knowledge.json'),'utf8'));
  const common = options['daemon-url'] ? ['--daemon-url',options['daemon-url']] : [];
  const statePath = join(directory,'opendesign-state.json');
  let state;
  try { state = JSON.parse(await readFile(statePath,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const invoke = args => cli([...args,...common],{ directory,od:options.od });
  const work = join(directory,'opendesign-work');
  // OpenDesign import-folder attaches a live directory, so copy the fixed
  // self-contained files first. Never let a design run edit the hash package.
  if (!state) {
    await mkdir(work,{recursive:true});
    for (const filename of ['index.html','video.html','diagram.svg','knowledge.json','quality.json','explanation.md','design.md','opendesign-brief.md','render-video.py','narrate.py','requirements-video.txt']) {
      let bytes;
      try { bytes = await readFile(join(directory,filename)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const target=join(work,filename);
      try { await writeFile(target,bytes,{flag:'wx'}); }
      catch (error) { if (error.code !== 'EEXIST' || !bytes.equals(await readFile(target))) throw error; }
    }
    const imported = JSON.parse(await invoke(['project','import-folder',work,'--name',data.title,'--json']));
    const id = imported.project?.id;
    if (typeof id !== 'string' || !id.trim()) throw new Error('OpenDesign did not return project.id; import not confirmed');
    state = { projectId:id,conversationId:imported.conversationId ?? null,connection:options['daemon-url']??'auto',imported:true,designStarted:false };
    await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{flag:'wx'});
  } else {
    if (typeof state.projectId !== 'string' || !state.projectId.trim()) throw new Error('Invalid saved OpenDesign project');
    if (state.connection !== (options['daemon-url']??'auto')) throw new Error('Saved project belongs to another daemon connection');
    await invoke(['project','info',state.projectId,'--json']);
  }
  if (options.design && !state.designStarted) {
    const args = ['run','start','--project',state.projectId,'--prompt-file',join(work,'opendesign-brief.md'),'--json'];
    if (options.agent) args.push('--agent',options.agent);
    const run = JSON.parse(await invoke(args));
    if (typeof run.runId !== 'string' || !run.runId) throw new Error('OpenDesign did not confirm runId; do not claim redesign started');
    state = {...state,designStarted:true,runId:run.runId};
    await writeFile(statePath,JSON.stringify(state,null,2)+'\n');
  }
  if (options.png) {
    if (state.designStarted) {
      const run=JSON.parse(await invoke(['run','info',state.runId,'--json']));
      if(run.status !== 'succeeded' || run.deliverableValid === false) throw new Error('Design run has not confirmed a successful deliverable; no PNG was exported.');
      state.designCompleted=true;
    }
    const output = join(directory,'opendesign-preview.png');
    try { await stat(output); throw new Error('PNG already exists; original preserved'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await invoke(['export','index.html','--project',state.projectId,'--format','image','--image-format','png','--out',output,'--json']);
    const bytes = await readFile(output);
    if (bytes.length < 24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('OpenDesign export is not a valid PNG signature');
    state.png = output;
    await writeFile(statePath,JSON.stringify(state,null,2)+'\n');
  }
  return { ...state, status:state.png?'exported':state.designStarted?'design-started':'imported',
    next:state.designStarted ? `od run info ${state.runId} --json; inspect the finished page before exporting or claiming success.` : 'Open the imported project in OpenDesign. Import alone does not mean OpenDesign redesigned the page.' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await connect(optionsFrom(process.argv.slice(2))))); }
  catch (error) { console.error(JSON.stringify({status:'failed',message:error.message})); process.exitCode=1; }
}
