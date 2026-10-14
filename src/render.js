import { createHash } from 'node:crypto';
import { validateExplanation } from './model.js';
import { pageRuntime } from './browser.js';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const css = `:root{color-scheme:light;--ink:#162433;--muted:#596978;--accent:#0e766e;--line:#d8e3e5}*{box-sizing:border-box}body{margin:0;background:#f4f7f7;color:var(--ink);font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1040px;margin:auto;padding:40px 24px}header{border-bottom:1px solid var(--line);padding-bottom:24px}.eyebrow{font-size:13px;letter-spacing:.15em;color:var(--accent);font-weight:700}h1{font-size:clamp(28px,4vw,42px);line-height:1.3;margin:12px 0}h2{font-size:22px;margin:28px 0 14px}p{white-space:pre-wrap;overflow-wrap:anywhere}.summary{font-size:19px;max-width:880px}nav{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap}button,input,select,a.tab{font:inherit;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:white;color:var(--ink)}button,a.tab{cursor:pointer}button:hover,a.tab:hover{border-color:var(--accent)}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #5eead4;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}a{color:var(--accent)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.point{background:white;border:1px solid var(--line);border-radius:12px;padding:20px}.point[hidden]{display:none}summary{cursor:pointer;font-weight:700}.point p{margin-bottom:0}svg{width:100%;height:auto}.diagram{overflow:auto;background:white;padding:12px;border:1px solid var(--line);border-radius:12px}.diagram svg{min-width:640px}.sources{font-size:14px;color:var(--muted)}footer{border-top:1px solid var(--line);margin-top:32px;padding-top:16px;font-size:13px;color:var(--muted)}canvas{display:block;width:100%;background:#0f172a;border-radius:12px}#position{flex:1;min-width:160px}#caption{background:white;padding:16px;border-radius:8px;white-space:pre-wrap}#status{font-size:14px;color:var(--muted)}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}@media print{nav,.controls,#status{display:none}body{background:white}main{padding:0}.point{break-inside:avoid}details:not([open])>p{display:block}a{color:inherit}}`;

function lines(text, size = 14) {
  const chars = [...text], rows = [];
  for (let i = 0; i < chars.length; i += size) rows.push(chars.slice(i, i + size).join(''));
  return rows;
}

/** Fixed row layout retains direction and edge labels even for cycles. */
export function renderDiagram(data) {
  const nodes = data.nodes.length ? data.nodes : data.points.map((p, i) => ({ id: `p${i}`, label: p.title }));
  const height = 70 + nodes.length * 130;
  const positions = new Map(nodes.map((node, i) => [node.id, 65 + i * 130]));
  const maxLane = 230 + data.edges.length * 9;
  const width = Math.max(960, 780 + maxLane);
  const edges = data.edges.map((edge, i) => {
    const a = positions.get(edge.from), b = positions.get(edge.to), x = 760 + i * 9;
    const labelRows = lines(edge.label, 10);
    const labelY = a + 20;
    const path = a === b ? `M680 ${a - 12} C${x} ${a - 85} ${x} ${a + 85} 680 ${a + 12}` : `M680 ${a} H${x} V${b} H684`;
    return `<g><title>${escapeHtml(`${edge.from} → ${edge.to}: ${edge.label}`)}</title><path d="${path}" stroke="#0e766e" fill="none" stroke-width="2" marker-end="url(#arrow)"/>${labelRows.map((line,j) => `<text x="${x + 8}" y="${labelY + j * 16}" font-size="12" fill="#0e766e">${escapeHtml(line)}</text>`).join('')}</g>`;
  }).join('');
  const boxes = nodes.map((node, i) => {
    const cy = positions.get(node.id), rows = lines(node.label);
    return `<g><title>${escapeHtml(node.label)}</title><rect x="120" y="${cy - 50}" width="560" height="100" rx="12" fill="#edf9f6" stroke="#92cabc"/><text x="80" y="${cy + 6}" font-size="20" fill="#596978">${i + 1}</text><text x="145" y="${cy - (rows.length - 1) * 7}" font-size="16" fill="#162433">${rows.map((row, j) => `<tspan x="145" dy="${j ? 15 : 0}">${escapeHtml(row)}</tspan>`).join('')}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title"><title id="diagram-title">${escapeHtml(data.title)}：${data.nodes.length ? '关系图' : '要点图；排列不表示因果关系'}</title><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#0e766e"/></marker></defs>${edges}${boxes}</svg>`;
}

function references(data) {
  return `<section class="sources"><h2>来源与依据</h2>${data.sources.length ? `<ul>${data.sources.map(source => {
    let url;
    try { const parsed = new URL(source.reference); if (['https:', 'http:'].includes(parsed.protocol)) url = parsed.href; } catch { /* local reference */ }
    return `<li>${escapeHtml(source.label)} — ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.reference)}</a>` : escapeHtml(source.reference)}</li>`;
  }).join('')}</ul>` : '<p>未提供可核对的来源。</p>'}${data.unknowns.length ? `<h2>待确认</h2><ul>${data.unknowns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</section>`;
}

function renderPage(data, video = false) {
  const runtime = `(${pageRuntime.toString()})();`;
  const scriptHash = createHash('sha256').update(runtime).digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data:; media-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  const content = video ? `<canvas id="film" width="1280" height="720" aria-label="讲解画面"></canvas><nav class="controls" aria-label="播放控制"><button id="play">播放</button><button id="restart">从头开始</button><input id="position" type="range" min="0" value="0" aria-label="选择场景"><label>每页秒数 <select id="duration"><option value="4">4</option><option value="6" selected>6</option><option value="10">10</option></select></label><button id="export-video">导出 WebM 视频</button><button id="cancel-export" hidden>停止并保存</button></nav><p id="caption" aria-live="polite"></p><p>导出时请保持此页面在前台。此版本输出字幕视频，无音轨。</p>` : `<nav aria-label="阅读控制"><input id="search" type="search" placeholder="搜索要点" aria-label="搜索要点"><button data-expand="true">展开全部</button><button data-expand="false">收起全部</button><button id="print">打印 / 保存 PDF</button></nav><section class="cards">${data.points.map((point, i) => `<details class="point" open><summary>${String(i + 1).padStart(2, '0')} · ${escapeHtml(point.title)}</summary><p>${escapeHtml(point.detail)}</p></details>`).join('')}</section><h2>图解</h2><p>${data.nodes.length ? '箭头仅表示输入中明确给出的关系。' : '每个框代表一个要点；排列不表示因果关系。'}</p><div class="diagram">${renderDiagram(data)}</div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}"><title>${escapeHtml(data.title)}</title><style>${css}</style></head><body><main><header><div class="eyebrow">理解模型输出 · ${video ? '讲解时间轴' : '交互阅读'}</div><h1>${escapeHtml(data.title)}</h1><p class="summary">${escapeHtml(data.summary)}</p></header><nav aria-label="输出格式"><a class="tab" href="index.html">交互页面</a><a class="tab" href="video.html">讲解时间轴</a><a class="tab" href="explanation.md">简明文本</a><a class="tab" href="diagram.svg">SVG 图解</a></nav>${content}<p id="status" role="status"></p>${references(data)}<footer>由 DeepSeek Harness 当前会话组织内容。使用同一份结构化说明生成各格式。</footer></main><script id="explanation-data" type="application/json">${jsonForHtml(data)}</script><script>${runtime}</script></body></html>`;
}

export function renderText(data) {
  return `# ${data.title}\n\n${data.summary}\n\n${data.points.map((point, i) => `## ${i + 1}. ${point.title}\n\n${point.detail}`).join('\n\n')}\n\n## 来源与依据\n\n${data.sources.length ? data.sources.map(s => `- ${s.label}：${s.reference}`).join('\n') : '未提供可核对的来源。'}${data.unknowns.length ? '\n\n## 待确认\n\n' + data.unknowns.map(s => `- ${s}`).join('\n') : ''}\n`;
}

/** All HTML pages share sibling links, so every mode includes the complete package. */
export function buildArtifacts(input) {
  const data = validateExplanation(input);
  return {
    'explanation.json': JSON.stringify(data, null, 2) + '\n',
    'explanation.md': renderText(data),
    'diagram.svg': renderDiagram(data),
    'index.html': renderPage(data),
    'video.html': renderPage(data, true),
  };
}
