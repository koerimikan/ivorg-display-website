import { ContractError } from './spec.js';
const reject = (code, detail) => { throw new ContractError(code, detail); };

export function assertAcyclic(ids, edges, code) {
  const color = new Map(), trail = [];
  function dfs(id) {
    if (color.get(id) === 1) reject(code, [...trail, id].join(' -> '));
    if (color.get(id) === 2) return;
    color.set(id, 1); trail.push(id);
    for (const next of edges(id)) dfs(next);
    trail.pop(); color.set(id, 2);
  }
  for (const id of ids) dfs(id);
}

export function validateGraph(graph) {
  if (graph.schemaVersion !== 1 || !Array.isArray(graph.objects)) reject('GRAPH_SHAPE', 'invalid graph');
  const byId = new Map();
  for (const o of graph.objects) {
    if (!o.objectId || byId.has(o.objectId) || !o.fields || !Array.isArray(o.children)) reject('GRAPH_ID', o.objectId);
    byId.set(o.objectId, o);
  }
  for (const o of graph.objects) {
    for (const child of o.children) if (!byId.has(child)) reject('GRAPH_REF', child);
    if (o.extendsRef && (!byId.has(o.extendsRef) || byId.get(o.extendsRef).type !== o.type || !['PageObject', 'ComponentObject','TransitionObject','TransitionDefinition'].includes(o.type))) reject('INHERITANCE_TYPE', o.objectId);
    for (const param of Object.values(o.params || {})) {
      if (['number','duration','percent'].includes(param.type)) {
        const value = Number(param.value);
        if (!String(param.value).trim() || !Number.isFinite(value) || (param.min !== undefined && (!Number.isFinite(Number(param.min)) || value < Number(param.min))) || (param.max !== undefined && (!Number.isFinite(Number(param.max)) || value > Number(param.max)))) reject('PARAM_RANGE', `${o.objectId}.${param.name}`);
      }
      if (param.type === 'enum' && !param.values?.split(',').includes(param.value)) reject('PARAM_ENUM', param.name);
      if (param.type === 'bool' && !['true','false'].includes(param.value)) reject('PARAM_BOOLEAN', param.name);
    }
  }
  for (const ref of graph.references) if (!byId.has(ref.target)) reject('GRAPH_REF', `${ref.owner}.${ref.field} -> ${ref.target}`);
  assertAcyclic(byId.keys(), id => byId.get(id).extendsRef ? [byId.get(id).extendsRef] : [], 'INHERITANCE_CYCLE');
  assertAcyclic(byId.keys(), id => byId.get(id).children, 'CONTAINMENT_CYCLE');
  const objectsOf = type => graph.objects.filter(o => o.type === type);
  for (const binding of objectsOf('TransitionBinding')) {
    const f = binding.fields;
    if (byId.get(f.fromPage)?.type !== 'PageObject' || byId.get(f.toPage)?.type !== 'PageObject' || byId.get(f.definitionRef)?.type !== 'TransitionDefinition' || byId.get(binding.transitionObjectId)?.type !== 'TransitionObject') reject('BINDING_REF_TYPE', binding.objectId);
    if (f.linkRef && byId.get(f.linkRef)?.type !== 'Link') reject('BINDING_REF_TYPE', f.linkRef);
  }
  for (const instance of objectsOf('TransitionInstance')) {
    if (byId.get(instance.fields.bindingRef)?.type !== 'TransitionBinding' || byId.get(instance.fields.definitionRef)?.type !== 'TransitionDefinition' || !/^[1-9]\d*$/.test(instance.fields.instanceSeq) || !instance.fields.sessionId) reject('INSTANCE_SHAPE', instance.objectId);
    if (byId.get(instance.fields.bindingRef).fields.definitionRef !== instance.fields.definitionRef) reject('INSTANCE_DEFINITION', instance.objectId);
  }
  const resolved = new Map();
  function resolve(id) {
    if (resolved.has(id)) return resolved.get(id);
    const o = byId.get(id), baseId = o.extendsRef || (o.type === 'TransitionBinding' ? o.fields.definitionRef : o.type === 'TransitionInstance' ? o.fields.bindingRef : null), base = baseId ? resolve(baseId) : null;
    const fields = { ...(base?.fields || {}), ...o.fields };
    const params = { ...(base?.params || {}), ...o.params };
    const locked = new Set([...(base?.locked || []), ...(o.locked || [])]);
    if (base) for (const field of base.locked) {
      if (Object.hasOwn(o.fields, field) && o.fields[field] !== base.fields[field]) reject('OVERRIDE_LOCKED_FIELD', field);
      if (o.params[field] && o.params[field].value !== base.params[field]?.value) reject('OVERRIDE_LOCKED_FIELD', field);
    }
    for (const [key, param] of Object.entries(params)) if (param.locked === 'true') locked.add(key);
    for (const override of o.overrides || []) {
      const { field, strategy } = override;
      if (['__proto__', 'constructor', 'prototype', 'id', 'objectId', 'kind', 'locked', 'route', 'pageKey', 'fromPage', 'toPage', 'definitionRef', 'bindingRef', 'extendsRef', 'children', 'sourceRef', 'implSource', 'implSymbol', 'layoutRef'].includes(field) || locked.has(field)) reject('OVERRIDE_LOCKED_FIELD', field);
      let value; try { value = JSON.parse(override.value); } catch { value = override.value; }
      if (!Object.hasOwn(params, field) && !Object.hasOwn(fields, field)) reject('OVERRIDE_UNKNOWN_FIELD', field);
      const target = params[field] ? 'param' : 'field';
      let old = target === 'param' ? params[field].value : fields[field];
      if (strategy === 'append') { if (!Array.isArray(old) || !Array.isArray(value)) reject('OVERRIDE_TYPE', field); value = [...old, ...value]; }
      else if (strategy === 'merge') {
        if (!old || typeof old !== 'object' || Array.isArray(old) || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => ['__proto__','constructor','prototype'].includes(k))) reject('OVERRIDE_TYPE', field);
        value = { ...old, ...value };
      } else if (strategy !== 'replace') reject('OVERRIDE_STRATEGY', strategy);
      if (target === 'param') params[field] = { ...params[field], value };
      else fields[field] = value;
    }
    for (const param of Object.values(params)) { if(['number','duration','percent'].includes(param.type)&&!['number','string'].includes(typeof param.value)||param.type==='enum'&&typeof param.value!=='string'||param.type==='string'&&typeof param.value!=='string'||param.type==='bool'&&!['boolean','string'].includes(typeof param.value))reject('PARAM_TYPE',`${id}.${param.name}`);const value = Number(param.value); if (['number','duration','percent'].includes(param.type) && (String(param.value).trim()==='' || !Number.isFinite(value) || param.min!==undefined && value<Number(param.min) || param.max!==undefined && value>Number(param.max))) reject('PARAM_RANGE',`${id}.${param.name}`); if (param.type==='enum'&&!param.values.split(',').includes(String(param.value))) reject('PARAM_ENUM',param.name); if (param.type==='bool'&&!['true','false'].includes(String(param.value))) reject('PARAM_BOOLEAN',param.name); }
    const children = [...new Set([...(o.extendsRef ? base.children : []),...o.children])];
    const result = { ...o, fields, params, children, locked: [...locked] }; resolved.set(id, result); return result;
  }
  for (const id of byId.keys()) resolve(id);
  assertAcyclic(byId.keys(), id => resolved.get(id).children, 'CONTAINMENT_CYCLE');
  return { byId, resolved, objectsOf };
}

export function projectTopology(graph) {
  const { objectsOf } = validateGraph(graph);
  const pages = objectsOf('PageObject');
  const bindings = objectsOf('TransitionBinding').filter(o => o.fields.enabled === 'true');
  const pageOrder = ['page.home', 'page.discography', 'page.newsletter'];
  const adjacencies = pageOrder.flatMap((id, i) => [pageOrder[i - 1], pageOrder[i + 1]].filter(Boolean).map(to => ({ from: id, to })));
  return { pages, bindings, adjacencies,
    nodes: [...pages.map(o => ({ id: o.objectId, kind: 'page', object: o })), ...bindings.map(o => ({ id: o.objectId, kind: 'binding', object: o }))],
    edges: bindings.flatMap(o => [{ from: o.fields.fromPage, to: o.objectId }, { from: o.objectId, to: o.fields.toPage }]),
    definitionReuse: Object.fromEntries([...new Set(bindings.map(o => o.fields.definitionRef))].map(id => [id, bindings.filter(o => o.fields.definitionRef === id).map(o => o.objectId)])),
    homeDiscoEntrances: bindings.filter(o => o.objectId.startsWith('bnd.home.') && o.fields.toPage === 'page.discography').map(o => o.objectId) };
}
