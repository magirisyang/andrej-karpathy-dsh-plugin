import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildArtifacts} from '../src/render.js';
import {validateExplanation} from '../src/model.js';
import {resolveCli} from '../integration/open-design.mjs';
import {ladder} from '../src/style.js';
import {pageRuntime} from '../src/browser.js';

const example={title:'一个待核验的机制',summary:'这项变化可能影响结果。',points:[{title:'先看输入',detail:'这里保留可能这一限定。'}],example:'假设示例：输入增加，但结果尚未确认。',nodes:[{id:'a',label:'输入'},{id:'b',label:'结果'}],facts:[{id:'f1',statement:'变化可能影响结果。',status:'inference',sourceIds:[]}],edges:[{from:'a',to:'b',label:'影响',factIds:['f1']}],steps:[{title:'输入',detail:'先查看输入。',nodeIds:['a'],edgeIndices:[]},{title:'可能的影响',detail:'关系还需要核验。',nodeIds:['a','b'],edgeIndices:[0]}]};
test('shared example, steps and uncertainty survive all presentation formats',()=>{
  const files=buildArtifacts(example,{strictness:95});
  assert.match(files['diagram.svg'],/stroke-dasharray="7 5"/);
  assert.match(files['diagram.svg'],/虚线：可能或待核验/);
  assert.match(files['index.html'],/id="step-next"/);
  assert.match(files['index.html'],/data-node="a"/);
  assert.match(files['explanation.md'],/假设示例/);
  assert.match(files['explanation.md'],/关系还需要核验/);
  assert.equal(JSON.parse(files['quality.json']).strictness,95);
  assert.equal(JSON.parse(files['knowledge.json']).example,example.example);
  assert.match(files['video.html'],/data.example/);
  assert.match(files['render-video.py'],/data.get\("steps"/);
  assert.deepEqual(ladder('diagram'),{rung:2,nextModes:['html','video']});
  assert.throws(()=>validateExplanation({...example,steps:[{title:'错误',detail:'未知节点',nodeIds:['missing']}]}),/node/i);
});
test('Windows installed CLI discovery uses the official configured entry without shell interpolation',async()=>{
  const local=await mkdtemp(join(tmpdir(),'karpathy-installed-'));
  const resources=join(local,'Programs','Open Design','resources');
  await mkdir(join(resources,'app'),{recursive:true});
  await writeFile(join(resources,'open-design-config.json'),JSON.stringify({daemonCliEntryRelative:'app/cli.mjs'}));
  await writeFile(join(resources,'app/cli.mjs'),'');
  const result=await resolveCli(['project','list'],{platform:'win32',environment:{LOCALAPPDATA:local}});
  assert.equal(result.executable,process.execPath);
  assert.deepEqual(result.args,[join(resources,'app/cli.mjs'),'project','list']);
  await writeFile(join(resources,'open-design-config.json'),JSON.stringify({daemonCliEntryRelative:'../escape.mjs'}));
  await assert.rejects(()=>resolveCli([],{platform:'win32',environment:{LOCALAPPDATA:local}}),/escapes/);
});

test('step controls change the explanation and highlight associated diagram items',()=>{
  const element=dataset=>({dataset,style:{removeProperty(key){delete this[key];}},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});
  const data=validateExplanation(example),nodes=data.nodes.map(n=>element({node:n.id})),edges=data.edges.map((_,i)=>element({edge:String(i)}));
  const ids=Object.fromEntries(['status','step-caption','step-prev','step-next','step-reset'].map(id=>[id,element({})]));
  ids['explanation-data']={textContent:JSON.stringify(data)};
  const prior=globalThis.document;
  globalThis.document={getElementById:id=>ids[id]??null,querySelectorAll:selector=>selector.includes('[data-node],')?[...nodes,...edges]:selector.includes('[data-node]')?nodes:selector.includes('[data-edge]')?edges:[]};
  try {
    pageRuntime();
    assert.match(ids['step-caption'].textContent,/1\/2/);
    assert.equal(nodes[1].style.opacity,'0.15');
    ids['step-next'].listeners.click();
    assert.match(ids['step-caption'].textContent,/2\/2.*关系还需要核验/);
    assert.equal(nodes[1].style.opacity,'1');
    assert.equal(ids['step-next'].disabled,true);
    ids['step-prev'].listeners.click();
    assert.equal(nodes[1].style.opacity,'0.15');
    ids['step-reset'].listeners.click();
    assert.equal(nodes[1].style.opacity,undefined);
  } finally {if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
});
