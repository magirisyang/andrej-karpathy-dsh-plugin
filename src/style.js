// Chinese adaptation of the upstream references, not an ASD certificate.
export const styleReferences = [
  'https://github.com/ashryaagr/karpathy-output-style',
  'https://github.com/bowen31337/comprehension-ladder',
  'https://github.com/ruanyf/document-style-guide',
];
export function strictnessValue(value = 80) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('writingStrictness must be an integer from 0 to 100');
  return value;
}
export const hasHedge = text => /可能|也许|或许|推测|尚不明确|尚未确认|未核验|不确定|\b(?:may|might|possibly|probably|unknown|uncertain)\b/iu.test(text);
export function edgeIsUncertain(edge, facts = []) {
  return edge.certainty === 'possible' || edge.certainty === 'assumed' || hasHedge(edge.label) ||
    (edge.factIds ?? []).some(id => { const fact=facts.find(item=>item.id===id); return fact && (fact.status !== 'source_stated' || hasHedge(fact.statement)); });
}
export function ladder(mode) {
  const rung={text:1,diagram:2,html:3,video:4,all:4}[mode];
  return {rung,nextModes:['text','diagram','html','video'].slice(rung)};
}
export const writingGuidance = `先确定读者的问题，再组织 3—7 个核心观点、机制、源材料中的不确定性和一个例子。不同输出使用同一份说明；格式升级不能新增事实或抹掉“可能、尚未确认”等限定。
中文采用阮一峰文档规范的短句、段首先给主题、统一术语、中文标点、中英文间距和数值单位规则。writingStrictness 是检查强度，不是 ASD-STE100 合规百分比；不机械套用英文单词数，也不删除否定事实或不确定性来缩短句子。
例子放在 explanation.example；来源未提供的例子必须显式标成示例或假设。过程可用 steps 描述，并关联已有 nodeIds/edgeIndices。facts 给来源依据，edges.factIds 关联相关事实；可能或假设关系用 certainty=possible/assumed，以虚线呈现。箭头标签说明传递了什么，不添猜测的因果。
用户只要求文字时不生成视频。逐步过程或参数探索优先 HTML；控件必须改变可见内容，并解释当前状态。来源不足时保留 unknowns，不用漂亮版式掩盖缺失证据。
成功交付后只简短说明成果；提供下一层的选择，不自动升级生成。视频须实际渲染和检查，场景表应包含视觉变化、旁白和时长。当前离线渲染器只支持其已实现的效果，不要冒称 Manim 或 3Blue1Brown 复杂动画。
这些规则参考 karpathy-output-style、comprehension-ladder 和 document-style-guide；它们是独立参考项目，不是官方背书。`;
