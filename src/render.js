import { createHash } from 'node:crypto';
import { validateExplanation } from './model.js';
import { pageRuntime } from './browser.js';
import { spatialModel, spatialSvg } from './spatial.js';
import { lintChinese } from './quality.js';
import { videoAssets } from './video-assets.js';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const css = `:root{color-scheme:light;--ink:#162433;--muted:#596978;--accent:#0e766e;--line:#d8e3e5}*{box-sizing:border-box}body{margin:0;background:#f4f7f7;color:var(--ink);font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1040px;margin:auto;padding:40px 24px}header{border-bottom:1px solid var(--line);padding-bottom:24px}.eyebrow{font-size:13px;letter-spacing:.15em;color:var(--accent);font-weight:700}h1{font-size:clamp(28px,4vw,42px);line-height:1.3;margin:12px 0}h2{font-size:22px;margin:28px 0 14px}p{white-space:pre-wrap;overflow-wrap:anywhere}.summary{font-size:19px;max-width:880px}nav{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap}button,input,select,a.tab{font:inherit;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:white;color:var(--ink)}button,a.tab{cursor:pointer}button:hover,a.tab:hover{border-color:var(--accent)}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #5eead4;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}a{color:var(--accent)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.point{background:white;border:1px solid var(--line);border-radius:12px;padding:20px}.point[hidden]{display:none}summary{cursor:pointer;font-weight:700}.point p{margin-bottom:0}svg{width:100%;height:auto}.evidence{margin-top:32px;padding:18px;background:white;border:1px solid var(--line);border-radius:12px}.diagram{overflow:auto;background:white;padding:12px;border:1px solid var(--line);border-radius:12px}.diagram svg{min-width:640px}.sources{font-size:14px;color:var(--muted)}footer{border-top:1px solid var(--line);margin-top:32px;padding-top:16px;font-size:13px;color:var(--muted)}canvas{display:block;width:100%;background:#0f172a;border-radius:12px}#position{flex:1;min-width:160px}#caption{background:white;padding:16px;border-radius:8px;white-space:pre-wrap}#status{font-size:14px;color:var(--muted)}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}@media print{nav,.controls,#status{display:none}body{background:white}main{padding:0}.point{break-inside:avoid}details:not([open])>p{display:block}a{color:inherit}}`;

function lines(text, size = 14) {
  const chars = [...text], rows = [];
  for (let i = 0; i < chars.length; i += size) rows.push(chars.slice(i, i + size).join(''));
  return rows;
}

/** Compact cards with explicit routes and a complete numbered relation key. */
export function renderDiagram(data) {
  if (data.simulation) return spatialSvg(spatialModel(data.simulation));
  const nodes = data.nodes.length ? data.nodes : data.points.map((p, i) => ({ id: `p${i}`, label: p.title }));
  const columns=3, cardWidth=240;
  const cardHeight=Math.max(90,...nodes.map(node=>lines(node.label,14).length*16+28)),rowHeight=cardHeight+65;
  const graphHeight = 65 + Math.ceil(nodes.length/columns)*rowHeight;
  const positions = new Map(nodes.map((node, i) => [node.id, {x:50+(i%columns)*310,y:65+cardHeight/2+Math.floor(i/columns)*rowHeight}]));
  const width = 1020;
  const edges = data.edges.map((edge, i) => {
    const a=positions.get(edge.from),b=positions.get(edge.to);
    const lane=12+(i%6)*5;
    let path,lx,ly;
    if(a===b){lx=a.x+cardWidth+24;ly=a.y;path=`M${a.x+cardWidth} ${a.y-20} C${lx+15} ${a.y-65} ${lx+15} ${a.y+65} ${a.x+cardWidth} ${a.y+20}`;}
    else if(a.y===b.y){const above=a.y-cardHeight/2-lane;lx=(a.x+b.x+cardWidth)/2;ly=above-4;path=`M${a.x+cardWidth/2} ${a.y-cardHeight/2} V${above} H${b.x+cardWidth/2} V${b.y-cardHeight/2}`;}
    else {const right=a.x+cardWidth+lane;const target=b.x-lane;const mid=b.y-cardHeight/2-14;lx=right+4;ly=(a.y+mid)/2+(i%5)*16;path=`M${a.x+cardWidth} ${a.y} H${right} V${mid} H${target} V${b.y} H${b.x}`;}
    return `<g class="relation" data-edge="${i}"><title>${escapeHtml(`${edge.from} → ${edge.to}: ${edge.label}`)}</title><path d="${path}" stroke="#0e766e" fill="none" stroke-width="2" marker-end="url(#arrow)"/><text x="${lx}" y="${ly}" font-size="12" fill="#0e766e">${i+1}</text></g>`;
  }).join('');
  const boxes = nodes.map((node, i) => {
    const {x,y}=positions.get(node.id),rows=lines(node.label,14);
    return `<g><title>${escapeHtml(node.label)}</title><rect x="${x}" y="${y-cardHeight/2}" width="${cardWidth}" height="${cardHeight}" rx="12" fill="#edf9f6" stroke="#92cabc"/><text x="${x+15}" y="${y-(rows.length-1)*8}" font-size="15" fill="#162433">${rows.map((row,j)=>`<tspan x="${x+15}" dy="${j?16:0}">${escapeHtml(row)}</tspan>`).join('')}</text></g>`;
  }).join('');
  const labels = new Map(nodes.map(node=>[node.id,node.label]));
  let legendY = graphHeight + 20;
  const legend = data.edges.map((edge,i)=>{
    const rows = lines(`${i+1}. ${labels.get(edge.from)} → ${labels.get(edge.to)}${edge.label ? '：'+edge.label : ''}`,58);
    const result = rows.map((row,j)=>`<text x="50" y="${legendY+j*20}" font-size="14" fill="#162433">${escapeHtml(row)}</text>`).join('');
    legendY += rows.length*20+16;
    return result;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${legendY+30}" role="img" aria-labelledby="diagram-title"><title id="diagram-title">${escapeHtml(data.title)}：${data.nodes.length ? '关系图' : '要点图；排列不表示因果关系'}</title><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#0e766e"/></marker></defs>${edges}${boxes}${legend}</svg>`;
}

function references(data) {
  const labels = { source_stated: '资料所述（未自动核验）', inference: '推断', assumption: '假设', unverified: '未核验' };
  return `<details class="evidence"><summary>查看依据、术语与适用边界</summary><section class="sources">${data.scope ? `<h2>适用范围</h2><p>${escapeHtml(data.scope)}</p>` : ''}${data.terms.length ? `<h2>术语</h2><ul>${data.terms.map(t => `<li><strong>${escapeHtml(t.term)}</strong>：${escapeHtml(t.definition)}</li>`).join('')}</ul>` : ''}${data.facts.length ? `<h2>事实、推断与假设</h2><ul>${data.facts.map(f => `<li><strong>${labels[f.status]}</strong>：${escapeHtml(f.statement)}</li>`).join('')}</ul>` : ''}<h2>来源与依据</h2>${data.sources.length ? `<ul>${data.sources.map(source => {
    let url;
    try { const parsed = new URL(source.reference); if (['https:', 'http:'].includes(parsed.protocol)) url = parsed.href; } catch { /* local reference */ }
    return `<li>${escapeHtml(source.label)} — ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.reference)}</a>` : escapeHtml(source.reference)}</li>`;
  }).join('')}</ul>` : '<p>未提供可核对的来源。</p>'}${data.unknowns.length ? `<h2>待确认</h2><ul>${data.unknowns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</section></details>`;
}

function renderPage(data, video = false, links) {
  const runtime = `(${pageRuntime.toString()})(${spatialModel.toString()},${spatialSvg.toString()});`;
  const scriptHash = createHash('sha256').update(runtime).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  const graph = data.simulation ? '' : `<section><h2>看图理解</h2><p>${data.nodes.length ? '箭头表示资料中给出的关系，编号对应下方说明。复杂图可以一次只看一条关系。' : '每个框代表一个要点；排列不表示因果关系。'}</p><nav><button id="download-diagram">导出完整 PNG 图解</button>${data.edges.length?`<label>查看关系 <select id="relation-filter"><option value="all">全部关系</option>${data.edges.map((edge,i)=>`<option value="${i}">${i+1}. ${escapeHtml(edge.label || `${edge.from} → ${edge.to}`)}</option>`).join('')}</select></label>`:''}</nav><div class="diagram" id="main-diagram">${renderDiagram(data)}</div></section>`;
  const content = video ? `<canvas id="film" width="1280" height="720" aria-label="讲解画面"></canvas><nav class="controls" aria-label="播放控制"><button id="play">播放</button><button id="restart">从头开始</button><input id="position" type="range" min="0" value="0" aria-label="选择场景"><label>每页秒数 <select id="duration"><option value="4">4</option><option value="6" selected>6</option><option value="10">10</option></select></label><button id="export-video">导出 WebM 视频</button><button id="cancel-export" hidden>停止并保存</button></nav><p id="caption" aria-live="polite"></p><p>浏览器导出为无音轨 WebM。中文旁白 MP4 请在 DSH 中执行生成包内的离线渲染脚本。</p>` : `${graph}<h2>关键要点</h2><nav aria-label="阅读控制"><input id="search" type="search" placeholder="搜索要点" aria-label="搜索要点"><button data-expand="true">展开全部</button><button data-expand="false">收起全部</button><button id="print">打印 / 保存 PDF</button></nav><section class="cards">${data.points.map((point, i) => `<details class="point"${i<3?' open':''}><summary>${String(i + 1).padStart(2, '0')} · ${escapeHtml(point.title)}</summary><p>${escapeHtml(point.detail)}</p></details>`).join('')}</section>`;
  const simulation = !video && data.simulation ? `<section><h2>空间交叉验证模拟</h2><p>使用固定种子的模拟空间样本和最近邻分类器；结果不是实际随机森林或真实树种制图精度。调节参数会重新分配空间折并计算预测。</p><nav><label>网格大小 <input id="grid-size" type="range" min="2" max="40" step="1" value="${data.simulation.gridSize}"><output id="grid-value">${data.simulation.gridSize}</output></label><label>验证折 <select id="holdout-fold">${Array.from({length:data.simulation.folds},(_,i)=>`<option value="${i}"${i===data.simulation.holdoutFold?' selected':''}>${i+1}</option>`).join('')}</select></label></nav><p id="spatial-metrics" role="status"></p><div id="spatial-plot" class="diagram">${spatialSvg(spatialModel(data.simulation))}</div></section>` : '';
  const names = { 'index.html': '阅读与图解', 'video.html': '讲解时间轴', 'explanation.md': '简明文本', 'diagram.svg': 'SVG 原图' };
  const navigation = Object.entries(links).filter(([filename]) => names[filename]).map(([filename,link]) => `<a class="tab" href="${escapeHtml(link)}">${names[filename]}</a>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><title>${escapeHtml(data.title)}</title><style>${css}</style></head><body><main><header><div class="eyebrow">理解模型输出 · ${video ? '讲解时间轴' : '交互阅读'}</div><h1>${escapeHtml(data.title)}</h1><p class="summary">${escapeHtml(data.summary)}</p></header><nav aria-label="输出格式">${navigation}</nav>${content}${simulation}<p id="status" role="status"></p>${references(data)}<footer>由 DeepSeek Harness 当前会话组织内容。使用同一份结构化说明生成各格式。</footer></main><script id="explanation-data" type="application/json">${jsonForHtml(data)}</script><script>${runtime}</script></body></html>`;
}

export function renderText(data) {
  const safe = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const labels = { source_stated: '资料所述（未自动核验）', inference: '推断', assumption: '假设', unverified: '未核验' };
  return `# ${safe(data.title)}\n\n${safe(data.summary)}\n\n${data.points.map((point, i) => `## ${i + 1}. ${safe(point.title)}\n\n${safe(point.detail)}`).join('\n\n')}${data.scope ? '\n\n## 适用范围\n\n' + safe(data.scope) : ''}${data.terms.length ? '\n\n## 术语\n\n' + data.terms.map(t => `- ${safe(t.term)}：${safe(t.definition)}`).join('\n') : ''}${data.facts.length ? '\n\n## 事实、推断与假设\n\n' + data.facts.map(f => `- [${labels[f.status]}] ${safe(f.statement)}`).join('\n') : ''}\n\n## 来源与依据\n\n${data.sources.length ? data.sources.map(s => `- ${safe(s.label)}：${safe(s.reference)}`).join('\n') : '未提供可核对的来源。'}${data.unknowns.length ? '\n\n## 待确认\n\n' + data.unknowns.map(s => `- ${safe(s)}`).join('\n') : ''}\n`;
}

/** Share the same knowledge while generating only selected formats and previews. */
export function buildArtifacts(input, { mode = 'all', links: overrides = {} } = {}) {
  const data = validateExplanation(input);
  if (!['all','text','diagram','html','video'].includes(mode)) throw new Error('Unsupported output mode');
  const files = {
    'knowledge.json': JSON.stringify(data, null, 2) + '\n',
    'quality.json': JSON.stringify(lintChinese(data), null, 2) + '\n',
    'explanation.md': renderText(data),
  };
  if (mode !== 'text') files['diagram.svg'] = renderDiagram(data);
  const links = Object.fromEntries(Object.keys(files).map(filename => [filename, overrides[filename] ?? filename]));
  if (['diagram','html','all'].includes(mode)) links['index.html'] = 'index.html';
  if (['video','all'].includes(mode)) links['video.html'] = 'video.html';
  if (links['index.html']) files['index.html'] = renderPage(data, false, links);
  if (links['video.html']) files['video.html'] = renderPage(data, true, links);
  if (['video','all'].includes(mode)) Object.assign(files,videoAssets);
  return files;
}
