const limits = { title: 120, summary: 2400, item: 1600, total: 60000 };
const text = (value, label, max = limits.item) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${label} must be non-empty text of at most ${max} characters`);
  return value.trim();
};
const array = (value, label, max) => {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be an array of at most ${max} items`);
  return value;
};

/** Validate before any file operation; never execute model-authored HTML or code. */
export function validateExplanation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('explanation must be an object');
  if (JSON.stringify(input).length > limits.total) throw new Error('explanation exceeds 60000 characters');
  const points = array(input.points, 'points', 12).map((p, i) => ({
    title: text(p?.title, `points[${i}].title`, 100),
    detail: text(p?.detail, `points[${i}].detail`),
  }));
  if (points.length === 0) throw new Error('points needs at least one item');
  const nodes = array(input.nodes ?? [], 'nodes', 16).map((n, i) => ({
    id: text(n?.id, `nodes[${i}].id`, 40),
    label: text(n?.label, `nodes[${i}].label`, 80),
  }));
  if (new Set(nodes.map(n => n.id)).size !== nodes.length) throw new Error('node ids must be unique');
  const ids = new Set(nodes.map(n => n.id));
  const edges = array(input.edges ?? [], 'edges', 32).map((e, i) => {
    if (!ids.has(e?.from) || !ids.has(e?.to)) throw new Error(`edges[${i}] references an unknown node`);
    return { from: e.from, to: e.to, label: e.label ? text(e.label, 'edge label', 80) : '' };
  });
  const sources = array(input.sources ?? [], 'sources', 20).map((s, i) => {
    const label = text(s?.label, `sources[${i}].label`, 200);
    const reference = text(s?.reference, `sources[${i}].reference`, 1000);
    return { label, reference };
  });
  const unknowns = array(input.unknowns ?? [], 'unknowns', 12).map(v => text(v, 'unknown'));
  return {
    title: text(input.title, 'title', limits.title),
    summary: text(input.summary, 'summary', limits.summary),
    points, nodes, edges, sources, unknowns,
  };
}

export const explanationSchema = {
  type: 'object', required: true, additionalProperties: false,
  properties: {
    title: { type: 'string', required: true, description: 'Short Chinese title.' },
    summary: { type: 'string', required: true, description: 'Main conclusion first. Preserve all qualifications, units and conditions.' },
    points: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
      title: { type: 'string', required: true }, detail: { type: 'string', required: true },
    } } },
    nodes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string', required: true }, label: { type: 'string', required: true },
    } } },
    edges: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      from: { type: 'string', required: true }, to: { type: 'string', required: true }, label: { type: 'string' },
    } } },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      label: { type: 'string', required: true }, reference: { type: 'string', required: true },
    } } },
    unknowns: { type: 'array', items: { type: 'string' }, description: 'Missing evidence or unresolved points; do not invent facts.' },
  },
};
