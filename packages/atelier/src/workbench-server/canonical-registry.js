import {getHostConfig} from './host-config.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSpec } from '../workbench-core/objects/l3.js';
import { reject } from '../workbench-core/changes/structure.js';
export async function readCanonicalRegistry(root) {
  const [spec, bytes] = await Promise.all([readFile(path.join(root,getHostConfig(root).specFile),'utf8'),readFile(path.join(root,getHostConfig(root).registryFile),'utf8')]);
  const registry = JSON.parse(bytes), { graph } = validateSpec(spec);
  if (registry.structuralObjects?.length || JSON.stringify(registry.graph) !== JSON.stringify(graph)) reject('REGISTRY_DRIFT', 'Registry must be the current Spec projection; repair through a reviewed metadata transaction.');
  if (registry.anchors.some(entry => !graph.objects.some(object => object.objectId === entry.objectId))) reject('REGISTRY_ID');
  return { spec, registry, graph };
}
