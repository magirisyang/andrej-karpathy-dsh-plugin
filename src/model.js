import { spatialModel } from './spatial.js';
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
    return { id: s.id ? text(s.id, 'source id', 40) : `s${i + 1}`, label, reference };
  });
  const sourceIds = new Set(sources.map(s => s.id));
  if (sourceIds.size !== sources.length) throw new Error('source ids must be unique');
  const facts = array(input.facts ?? [], 'facts', 24).map((f, i) => {
    const status = f.status ?? 'unverified';
    if (!['source_stated', 'inference', 'assumption', 'unverified'].includes(status)) throw new Error('Invalid fact status');
    const references = array(f.sources ?? [], 'fact sources', 20).map(v => text(v, 'source id', 40));
    if (references.some(id => !sourceIds.has(id))) throw new Error('fact references an unknown source');
    return { id: f.id ? text(f.id, 'fact id', 40) : `f${i + 1}`, statement: text(f.statement, 'fact statement'), status, sources: references };
  });
  if (new Set(facts.map(f => f.id)).size !== facts.length) throw new Error('fact ids must be unique');
  const terms = array(input.terms ?? [], 'terms', 24).map(entry => ({
    term: text(entry.term, 'term', 80), definition: text(entry.definition, 'term definition', 500),
    aliases: array(entry.aliases ?? [], 'aliases', 8).map(v => text(v, 'alias', 80)),
  }));
  let simulation;
  if (input.simulation) {
    if (input.simulation.kind !== 'spatial_cv') throw new Error('Unsupported simulation kind');
    simulation = { kind: 'spatial_cv', gridSize: 10, folds: 5, holdoutFold: 0, seed: 42, pointCount: 120, ...input.simulation };
    spatialModel(simulation);
  }
  const unknowns = array(input.unknowns ?? [], 'unknowns', 12).map(v => text(v, 'unknown'));
  return {
    title: text(input.title, 'title', limits.title),
    summary: text(input.summary, 'summary', limits.summary),
    points, nodes, edges, sources, unknowns, facts, terms,
    scope: input.scope ? text(input.scope, 'scope', 1200) : '',
    ...(simulation ? { simulation } : {}),
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
      id: { type: 'string' },
      label: { type: 'string', required: true }, reference: { type: 'string', required: true },
    } } },
    unknowns: { type: 'array', items: { type: 'string' }, description: 'Missing evidence or unresolved points; do not invent facts.' },
    scope: { type: 'string', description: 'Applicability, conditions and exclusions.' },
    terms: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      term: { type: 'string', required: true }, definition: { type: 'string', required: true }, aliases: { type: 'array', items: { type: 'string' } },
    } } },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, statement: { type: 'string', required: true },
      status: { type: 'string', enum: ['source_stated', 'inference', 'assumption', 'unverified'] },
      sources: { type: 'array', items: { type: 'string' }, description: 'IDs from explanation.sources; an absent ID defaults to s1, s2, etc.' },
    } } },
    simulation: { type: 'object', additionalProperties: false, properties: {
      kind: { type: 'string', required: true, enum: ['spatial_cv'] },
      gridSize: { type: 'number' }, folds: { type: 'integer' }, holdoutFold: { type: 'integer' }, seed: { type: 'integer' }, pointCount: { type: 'integer' },
    }, description: 'Optional seeded spatial-CV nearest-neighbor toy model. Never label its accuracy as real RF results.' },
  },
};
