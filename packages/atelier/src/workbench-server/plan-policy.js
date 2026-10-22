import {getHostConfig} from './host-config.js';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { deny } from './auth.js';

export function highRisk(plan) {
  const sources = plan.changes.filter(change => change.file.startsWith('src/'));
  return new Set(sources.map(change => path.posix.dirname(change.file))).size > 1 ||
    sources.length > 5 || plan.ops?.some(op => op.type === 'removeUnbound') === true;
}

export async function checkLockedObjects(root, plan, parameters) {
  const locked = parameters.values['objects.locked'] || [];
  if (!locked.length) return;
  const file = getHostConfig(root).registryFile;
  const registry = JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const projected = plan.changes.find(change => change.file === file);
  const afterRegistry = projected ? JSON.parse(projected.after) : registry;
  for (const objectId of locked) {
    const binding = registry.anchors.find(entry => entry.objectId === objectId);
    if (!binding) deny('LOCKED_OBJECT_UNBOUND', 409);
    const change = plan.changes.find(entry => entry.file === binding.anchor.file);
    if (!change) continue;
    const next = afterRegistry.anchors.find(entry => entry.objectId === objectId);
    const before = resolveAnchor(binding.anchor, change.before);
    const after = next && resolveAnchor(next.anchor, change.after);
    if (before.state !== 'bound' || after?.state !== 'bound') deny('IMMUTABLE_OBJECT');
    const oldBytes = change.before.slice(...before.anchor.range);
    const newBytes = change.after.slice(...after.anchor.range);
    if (oldBytes !== newBytes) deny('IMMUTABLE_OBJECT');
  }
}
