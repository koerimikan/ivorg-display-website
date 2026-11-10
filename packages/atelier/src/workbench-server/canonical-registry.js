import {getHostConfig} from './host-config.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSpec } from '../workbench-core/objects/l3.js';
import { reject } from '../workbench-core/changes/structure.js';

// Registry v2 persists only what cannot be derived: anchors (and, transiently,
// structuralObjects). The object graph is the Spec projection and is attached in
// memory on every read, so a Spec-only edit changes zero registry bytes.
// v1 files (with a committed graph) still load when that graph equals the Spec
// projection, and are flagged so the next registry write migrates them.
export function parseRegistry(bytes, graph) {
  const registry = JSON.parse(bytes);
  if (registry.schemaVersion === 1) {
    if (JSON.stringify(registry.graph) !== JSON.stringify(graph)) reject('REGISTRY_DRIFT', 'Registry must be the current Spec projection; repair through a reviewed metadata transaction.');
    Object.defineProperty(registry, 'needsMigration', { value: true, enumerable: false });
  } else if (registry.schemaVersion === 2) {
    if ('graph' in registry) reject('REGISTRY_DRIFT', 'Registry v2 must not persist the derived graph.');
    registry.graph = graph;
  } else reject('REGISTRY_VERSION', String(registry.schemaVersion));
  if (!Array.isArray(registry.anchors)) reject('REGISTRY_SCHEMA', 'anchors');
  return registry;
}

// Live byte offsets are recomputed by resolveAnchor; persisting them only churns.
export function serializeRegistry(registry) {
  const out = { schemaVersion: 2 };
  if (registry.structuralObjects?.length) out.structuralObjects = registry.structuralObjects;
  out.anchors = registry.anchors.map(({ anchor: { range, ...anchor }, ...entry }) => ({ ...entry, anchor }));
  return JSON.stringify(out, null, 2) + '\n';
}

export async function readCanonicalRegistry(root) {
  const [spec, bytes] = await Promise.all([readFile(path.join(root,getHostConfig(root).specFile),'utf8'),readFile(path.join(root,getHostConfig(root).registryFile),'utf8')]);
  const { graph } = validateSpec(spec), registry = parseRegistry(bytes, graph);
  if (registry.structuralObjects?.length) reject('REGISTRY_DRIFT', 'Registry must be the current Spec projection; repair through a reviewed metadata transaction.');
  if (registry.anchors.some(entry => !graph.objects.some(object => object.objectId === entry.objectId))) reject('REGISTRY_ID');
  return { spec, registry, graph };
}
