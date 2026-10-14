import test from 'node:test';
import assert from 'node:assert/strict';
import { routeTask } from '../src/route.js';
import { spatialModel } from '../src/spatial.js';
import { lintChinese } from '../src/quality.js';
import { validateExplanation } from '../src/model.js';

test('simple questions stay text; parameters route HTML; time evolution never auto-starts video', () => {
  assert.equal(routeTask('什么是空间交叉验证？').mode,'text');
  assert.equal(routeTask('调整网格大小会怎样改变验证结果？').mode,'html');
  assert.equal(routeTask('训练网格和验证网格之间是什么关系？').mode,'diagram');
  assert.equal(routeTask('通过动画解释空间泄漏').mode,'diagram');
  assert.equal(routeTask('制作中文讲解视频').mode,'video');
  assert.equal(routeTask('调整参数','text').mode,'text');
});
test('seeded simulator separates spatial cells and matches independent nearest-neighbor calculation', () => {
  const parameters = { gridSize:10,folds:5,holdoutFold:0,seed:42,pointCount:120 };
  const result = spatialModel(parameters);
  assert.deepEqual(result,spatialModel(parameters));
  const trainCells = new Set(result.train.map(p=>p.cellX+':'+p.cellY));
  assert.ok(result.validation.every(p=>!trainCells.has(p.cellX+':'+p.cellY)));
  let correct = 0;
  for (const point of result.validation) {
    const neighbor = [...result.train].sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0];
    if (neighbor.label===point.label) correct++;
    assert.equal(point.prediction,neighbor.label);
  }
  assert.equal(result.accuracy,correct/result.validation.length);
  const changed = spatialModel({...parameters,gridSize:30});
  assert.notDeepEqual(result.points.map(p=>p.fold),changed.points.map(p=>p.fold));
  assert.deepEqual(result.points.map(p=>[p.x,p.y,p.label]),changed.points.map(p=>[p.x,p.y,p.label]));
});
test('linter reports mechanical issues without claiming fact verification', () => {
  const data = validateExplanation({title:'示例',summary:'众所周知，'+ '长句'.repeat(55),points:[{title:'术语',detail:'用 RF 计算。'}],terms:[{term:'随机森林',definition:'分类算法',aliases:['RF']}],facts:[{statement:'某结论',status:'source_stated'}]});
  const report=lintChinese(data);
  for (const code of ['LONG_SENTENCE','VAGUE_PHRASE','TERM_ALIAS','MISSING_FACT_SOURCE','NO_SOURCE']) assert.ok(report.issues.some(i=>i.code===code));
  assert.equal(report.semanticFactsVerified,false);
  assert.throws(()=>validateExplanation({...data,facts:[{statement:'事实',sources:['missing']}]}),/unknown source/);
});
