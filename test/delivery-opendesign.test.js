import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { deliveryQueue } from '../src/delivery.js';
import { designBackend, openDesignArtifacts } from '../src/opendesign.js';
import { cliInvocation, connect, optionsFrom } from '../integration/open-design.mjs';
import { buildArtifacts } from '../src/render.js';

test('delivery is published once only after a successful non-cancelled result', () => {
  let listener;
  const events=[];
  const ctx={on:(_event,fn)=>{listener=fn;},get:()=>({stateOf:()=>({openTurnStartSeq:10,lastTurn:3})})};
  const queue=deliveryQueue(ctx);
  const exec={callId:'call-real',signal:new AbortController().signal,agent:{session:{append:(...args)=>events.push(args)}}};
  assert.equal(queue(exec,'explanations/package/index.html','阅读与图解').status,'queued');
  assert.equal(events.length,0);
  listener(exec,{isError:false});listener(exec,{isError:false});
  assert.deepEqual(events,[['deliverables/presented',{turn:3,callId:'call-real',files:[{path:'explanations/package/index.html',description:'阅读与图解'}]}]]);
  queue(exec,'second.html','第二份');listener(exec,{isError:true});
  assert.equal(events.length,1);
  assert.equal(queue({signal:exec.signal,agent:{session:{}}},'page.html','页面').status,'needs-present');
  const controller=new AbortController();const cancelled={...exec,signal:controller.signal};
  queue(cancelled,'third.html','取消');controller.abort();listener(cancelled,{isError:false});assert.equal(events.length,1);
});

test('OpenDesign is explicit and Windows argv cannot execute research text', () => {
  assert.equal(designBackend('请解释这个项目'),'builtin');
  assert.equal(designBackend('用 OpenDesign 做图解'),'opendesign');
  assert.equal(designBackend('用 OpenDesign 做图解','builtin'),'builtin');
  assert.throws(()=>designBackend('','unknown'),/Unsupported/);
  assert.throws(()=>optionsFrom(['--daemon-url','https://example.com']),/loopback/);
  const malicious="$(Write-Output injected); '& exit 99";
  const invocation=cliInvocation(['project','import-folder',malicious],{platform:'win32'});
  assert.equal(invocation.executable,'powershell.exe');
  assert.equal(invocation.args.includes('-ExecutionPolicy'),false);
  const code=Buffer.from(invocation.args.at(-1),'base64').toString('utf16le');
  assert.ok(code.includes('ConvertFrom-Json'));
  assert.ok(code.includes("''& exit 99"));
});

async function project() {
  const directory=await mkdtemp(join(tmpdir(),'karpathy-od-'));
  const input={title:'读懂一个插件',summary:'模型组织内容，插件负责呈现。',points:[{title:'一个例子',detail:'问题变成阅读页面。'}],nodes:[{id:'a',label:'用户问题'},{id:'b',label:'讲解页面'}],edges:[{from:'a',to:'b',label:'生成'}]};
  for(const [name,content] of Object.entries({...buildArtifacts(input,{mode:'diagram'}),...openDesignArtifacts()}))await writeFile(join(directory,name),content);
  return directory;
}
test('OpenDesign import uses an isolated copy, preserves state and starts no model by default', async () => {
  const directory=await project(),calls=[];
  const cli=async args=>{calls.push(args);return JSON.stringify({project:{id:'p1'},conversationId:'c1'});};
  const result=await connect({directory},cli);
  assert.equal(result.status,'imported');assert.equal(result.designStarted,false);
  assert.deepEqual(calls[0].slice(0,3),['project','import-folder',join(directory,'opendesign-work')]);
  assert.equal(calls.length,1);
  const original=await readFile(join(directory,'index.html'),'utf8');
  await writeFile(join(directory,'opendesign-work/index.html'),'edited in OpenDesign');
  const repeated=await connect({directory},cli);
  assert.equal(repeated.projectId,'p1');assert.equal(calls.length,2);assert.equal(calls[1][1],'info');
  assert.equal(await readFile(join(directory,'index.html'),'utf8'),original);
  assert.equal(await readFile(join(directory,'opendesign-work/index.html'),'utf8'),'edited in OpenDesign');
});
test('OpenDesign design waits for confirmed runId and never claims PNG completion', async () => {
  const directory=await project(),calls=[];
  const cli=async args=>{calls.push(args);return JSON.stringify(args[0]==='run'?{runId:'r1'}:{project:{id:'p2'}});};
  const result=await connect({directory,design:true,agent:'deepseek-harness'},cli);
  assert.equal(result.status,'design-started');assert.equal(result.runId,'r1');assert.equal(result.png,undefined);
  assert.ok(calls[1].includes('deepseek-harness'));assert.equal(calls[1][1],'start');
  await assert.rejects(()=>connect({directory,png:true},cli),/successful deliverable/);
  const failing=await project();
  await assert.rejects(()=>connect({directory:failing,design:true},async args=>JSON.stringify(args[0]==='run'?{}:{project:{id:'p3'}})),/confirm runId/);
  assert.equal(JSON.parse(await readFile(join(failing,'opendesign-state.json'),'utf8')).designStarted,false);
});

test('OpenDesign failures leave native page usable and create no success state', async () => {
  const directory=await project();
  await assert.rejects(()=>connect({directory},async()=>{throw new Error('CLI unavailable');}),/unavailable/);
  await assert.rejects(()=>readFile(join(directory,'opendesign-state.json')),/ENOENT/);
  assert.ok((await readFile(join(directory,'index.html'),'utf8')).includes('读懂一个插件'));
});

test('desktop-selected projects must attach the isolated package folder',async()=>{
  const directory=await project(),calls=[];
  const cli=async args=>{calls.push(args);return JSON.stringify({project:{id:'desktop-project'},resolvedDir:join(directory,'opendesign-work')});};
  const result=await connect({directory,project:'desktop-project'},cli);
  assert.equal(result.importMethod,'desktop-selected');
  assert.equal(calls[0][1],'info');
  assert.equal(result.designStarted,false);
  await assert.rejects(()=>connect({directory,project:'other'},cli),/another project/);
  const second=await project();
  await assert.rejects(()=>connect({directory:second,project:'desktop-project'},async()=>JSON.stringify({project:{id:'desktop-project'},resolvedDir:directory})),/must attach/);
  await assert.rejects(()=>readFile(join(second,'opendesign-state.json')),/ENOENT/);
});
