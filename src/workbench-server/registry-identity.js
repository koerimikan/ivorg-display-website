import { randomUUID } from 'node:crypto';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { reject } from '../workbench-core/changes/structure.js';

export function ensureRecordIdentity(registry, source, file, record, preferredId) {
  if (!record || record.inExpression) reject('ANCHOR_UNMAPPED');
  registry.structuralObjects ??= [];
  const bound = registry.anchors.filter(entry => entry.anchor.file === file).map(entry => ({ entry, result: resolveAnchor(entry.anchor, source) })).filter(item => item.result.state === 'bound');
  const exact = bound.filter(item => item.result.anchor.range[0] === record.start);
  if (exact.length) {
    if (preferredId && exact.some(item => item.entry.objectId === preferredId)) return preferredId;
    if (preferredId && !/^node\.target\./.test(preferredId)) reject('OBJECT_ANCHOR_MISMATCH');
    return exact[0].entry.objectId;
  }
  const owner = bound.filter(item => item.result.anchor.range[0] < record.start && item.result.anchor.range[1] >= record.end)
    .sort((a, b) => (a.result.anchor.range[1] - a.result.anchor.range[0]) - (b.result.anchor.range[1] - b.result.anchor.range[0]))[0];
  if (!owner) reject('PARENT_IDENTITY_UNBOUND');
  const objectId = /^node\.target\.[\w.-]+$/.test(preferredId || '') ? preferredId : `node.target.${randomUUID()}`;
  if ([...registry.graph.objects, ...registry.structuralObjects].some(object => object.objectId === objectId)) reject('OBJECT_ID_COLLISION');
  registry.structuralObjects.push({ objectId, type: 'Node', parentObjectId: owner.entry.objectId, fields: { tag: record.tag, observed: 'true' }, observed: true });
  registry.anchors.push({ objectId, anchor: { file, kind: 'structural', path: record.path, tag: record.tag } });
  return objectId;
}

export function projectObservedObjects(canonical, registry) {
  const graph = structuredClone(canonical);
  const ids = new Set(graph.objects.map(object => object.objectId));
  for (const object of registry.structuralObjects || []) {
    if (!/^node\.[\w.-]+$/.test(object.objectId) || ids.has(object.objectId)) reject('REGISTRY_ID');
    ids.add(object.objectId);
    graph.objects.push({ objectId: object.objectId, type: 'Node', version: 1, fields: { ...(object.fields || {}), id: object.objectId }, children: [], description: 'AST-observed structure', params: {}, overrides: [], provenance: { sourceRef: 'versioned-registry', specHash: graph.specHash } });
  }
  for (const object of registry.structuralObjects || []) {
    const parent = graph.objects.find(candidate => candidate.objectId === object.parentObjectId);
    if (!parent) reject('REGISTRY_PARENT', object.objectId);
    if (!parent.children.includes(object.objectId)) parent.children.push(object.objectId);
  }
  return graph;
}
