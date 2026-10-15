import { strictnessValue, styleReferences } from './style.js';

/** Advice only: never rewrite facts, units, source quotations or hedges. */
export function lintChinese(data, { strictness = 80 } = {}) {
  strictnessValue(strictness);
  const issues=[];
  const caps=strictness>=90?{clause:30,sentence:80}:strictness>=70?{clause:40,sentence:100}:{clause:50,sentence:120};
  const issue=(code,location,message)=>issues.push({code,location,message});
  const inspect=(original,location)=>{
    const value=original.replace(/`[^`]*`|https?:\/\/[^\s，。]+/g,' ');
    if(strictness>=40){
      if(value.split(/[。！？]/u).some(s=>[...s.trim()].length>caps.sentence))issue('LONG_SENTENCE',location,'句子包含较多内容；分开观点，保留条件和不确定性。');
      if(value.split(/[，。！？；：\n]/u).some(s=>/\p{Script=Han}/u.test(s)&&[...s.trim()].length>caps.clause))issue('LONG_CLAUSE',location,'分句较长；按意义拆开，不删数字、条件或限定词。');
      if(/\p{Script=Han}[A-Za-z]|[A-Za-z]\p{Script=Han}/u.test(value))issue('CJK_LATIN_SPACING',location,'中文与英文之间建议留半角空格；代码与专名保持原样。');
      if(/[０-９]/u.test(value))issue('FULLWIDTH_NUMBER',location,'叙述中的阿拉伯数字建议用半角；不要改变数值。');
      if(/\d(?:\.\d+)?(?:GB|MB|KB|kg|km|ms)\b/u.test(value))issue('NUMBER_UNIT_SPACING',location,'数值与英文单位之间建议留空格；单位本身保留。');
      if(/\p{Script=Han}[,;:]|[,;:]\p{Script=Han}/u.test(value))issue('CHINESE_PUNCTUATION',location,'中文正文建议使用中文标点；代码和英文句子除外。');
    }
    if(/赋能|毋庸置疑|众所周知|显而易见|全面提升|综上所述/u.test(value))issue('VAGUE_PHRASE',location,'可能含有套话，请用具体对象和动作表达。');
    if(value.split(/[。！？]/u).filter(s=>s.trim()).length>6)issue('LONG_PARAGRAPH',location,'段落较长；围绕一个主题分段。');
  };
  inspect(data.summary,'summary');
  if(data.example)inspect(data.example,'example');
  for(const [i,p]of data.points.entries()){inspect(p.title,`points[${i}].title`);inspect(p.detail,`points[${i}].detail`);}
  for(const [i,s]of (data.steps??[]).entries()){inspect(s.title,`steps[${i}].title`);inspect(s.detail,`steps[${i}].detail`);}
  for(const [i,node]of data.nodes.entries()){inspect(node.label,`nodes[${i}]`);if([...node.label].length>24)issue('LONG_DIAGRAM_LABEL',`nodes[${i}]`,'图中标签过长；保留概念，详细说明放在正文。');}
  for(const [i,edge]of data.edges.entries()){inspect(edge.label,`edges[${i}]`);if(!edge.label)issue('MISSING_EDGE_LABEL',`edges[${i}]`,'箭头含义未说明；不要猜测传递内容或因果。');}
  inspect(data.scope,'scope');
  data.unknowns.forEach((text,i)=>inspect(text,`unknowns[${i}]`));
  const body=[data.summary,data.example??'',...data.points.map(p=>p.detail),...data.facts.map(f=>f.statement)].join('\n');
  for(const entry of data.terms)for(const alias of entry.aliases)if(alias!==entry.term&&body.includes(alias))issue('TERM_ALIAS',entry.term,`发现“${alias}”；检查是否应统一为“${entry.term}”。`);
  for(const fact of data.facts){inspect(fact.statement,fact.id);if(fact.status==='source_stated'&&!fact.sources.length)issue('MISSING_FACT_SOURCE',fact.id,'该事实未关联来源，不能据此认定已核验。');}
  if(!data.sources.length)issue('NO_SOURCE','sources','未提供可核对来源。');
  return {kind:'mechanical-advisory',semanticFactsVerified:false,strictness,profile:'zh-adapted',certifiedSTE:false,references:styleReferences,issues};
}
