/** Mechanical checks are advisory, never presented as semantic fact verification. */
export function lintChinese(data) {
  const issues = [];
  const inspect = (value, location) => {
    for (const sentence of value.split(/[。！？]/u).filter(Boolean)) {
      if ([...sentence].length > 90) issues.push({ code: 'LONG_SENTENCE', location, message: '句子较长；检查是否包含多个观点，不按字数自动删改。' });
    }
    if (/赋能|毋庸置疑|众所周知|显而易见|全面提升|综上所述/u.test(value))
      issues.push({ code: 'VAGUE_PHRASE', location, message: '可能含有套话或空泛断言，请结合上下文检查。' });
  };
  inspect(data.summary, 'summary');
  data.points.forEach((point, i) => inspect(point.detail, `points[${i}]`));
  const body = [data.summary, ...data.points.map(p => p.detail), ...data.facts.map(f => f.statement)].join('\n');
  for (const entry of data.terms) {
    for (const alias of entry.aliases) {
      if (alias !== entry.term && body.includes(alias)) issues.push({ code: 'TERM_ALIAS', location: entry.term, message: `发现“${alias}”；检查是否应统一为“${entry.term}”。` });
    }
  }
  for (const fact of data.facts) {
    if (fact.status === 'source_stated' && !fact.sources.length)
      issues.push({ code: 'MISSING_FACT_SOURCE', location: fact.id, message: '该事实未关联来源，不能据此认定已经核验。' });
  }
  if (!data.sources.length) issues.push({ code: 'NO_SOURCE', location: 'sources', message: '未提供可核对来源。' });
  return { kind: 'mechanical-advisory', semanticFactsVerified: false, issues };
}
