import {getHostConfig} from './host-config.js';
import path from 'node:path';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { hash } from '../workbench-core/objects/spec.js';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { parseSpec } from '../workbench-core/objects/spec.js';
import { analyzeSource } from '../dev-studio/source-engine.js';
import { createTaskService } from '../dev-studio/task-service.js';
import { sanitizeSnapshot, estimateTokens } from '../dev-studio/task-proposal.js';
import { reject } from '../workbench-core/changes/structure.js';
import { redact } from './event-log.js';
import { parse } from '@astrojs/compiler-rs';

const compactObject = object => object && ({ objectId: object.objectId, type: object.type, fields: object.fields, description: object.description });
const line = (source, offset) => source.slice(0, offset).split('\n').length;
async function sourceFile(root, file) {
  if (!/^src\/[\w/-]+\.(astro|css|js)$/.test(file)) reject('CONTEXT_PATH');
  const target = path.join(root, file), actual = await realpath(target);
  if (!actual.startsWith((await realpath(root)) + path.sep) || (await lstat(target)).isSymbolicLink()) reject('CONTEXT_PATH');
  return readFile(actual, 'utf8');
}
function invariants(spec) {
  const output = [];
  function visit(node) { if (node.tag === 'Invariant') output.push({ ...node.attrs, description: node.children.find(child => child.tag === 'Description')?.text.trim(), assertions: node.children.filter(child => child.tag === 'Assertion').map(child => child.attrs) }); for (const child of node.children) visit(child); }
  visit(parseSpec(spec)); return output;
}

export async function buildAgentContext(root, current, { objectId, selection, parameters, maxBytes = 6000 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 3000 || maxBytes > 24000) reject('CONTEXT_BUDGET');
  const graph = current.registry.graph, objects = [...graph.objects, ...(current.registry.structuralObjects || [])], byId = new Map(objects.map(object => [object.objectId, object]));
  if (objectId && !byId.has(objectId)) reject('OBJECT_NOT_FOUND');
  const files = Object.keys(current.sources), analysis = new Map();
  const lookup = async sourceId => {
    if (!/^s_[a-f0-9]{16}$/.test(sourceId)) reject('ANCHOR_UNMAPPED');
    for (const file of files) { if (!analysis.has(file)) analysis.set(file, analyzeSource(current.sources[file], file)); const record = analysis.get(file).records.find(record => record.sourceId === sourceId); if (record) return { record, source: current.sources[file] }; }
    reject('ANCHOR_UNMAPPED');
  };
  let snapshot, selectedSource;
  if (selection?.parentSourceId) {
    selectedSource = await lookup(selection.parentSourceId);
    snapshot = selection.capture ? sanitizeSnapshot(selection.capture) : { domSummary: { nodes: [{ id: 'n0', tag: selectedSource.record.tag, sourceId: selection.parentSourceId }] }, sourceIds: [selection.parentSourceId], styles: {} };
    snapshot.sourceIds = [selection.parentSourceId];
  }
  const anchor = objectId && current.registry.anchors.find(entry => entry.objectId === objectId);
  if (!selectedSource && anchor) {
    const source = current.sources[anchor.anchor.file], resolved = resolveAnchor(anchor.anchor, source);
    if (resolved.state !== 'bound') reject('ANCHOR_UNMAPPED');
    const analyzed = analyzeSource(source, anchor.anchor.file), record = analyzed.records.find(record => record.range[0] === resolved.anchor.range[0]);
    if (record) { selectedSource = { record, source }; snapshot = { domSummary: { nodes: [{ id: 'n0', tag: record.tag, sourceId: record.sourceId }] }, sourceIds: [record.sourceId], styles: {} }; }
  }
  const target = objectId ? byId.get(objectId) : graph.objects.find(object => object.type === 'Spec');
  const parent = objectId && graph.objects.find(object => object.children.includes(objectId));
  const siblings = parent ? parent.children.filter(id => id !== objectId).slice(0, 8).map(id => compactObject(byId.get(id))).filter(Boolean) : [];
  const componentIds = new Set([...(target?.children || []), ...graph.references.filter(ref => ref.owner === objectId && ['componentRef', 'layoutRef'].includes(ref.field)).map(ref => ref.target)]);
  const components = [...componentIds].map(id => byId.get(id)).filter(object => object?.type === 'ComponentObject').slice(0, 4).map(compactObject);
  const bundle = {
    schemaVersion: 1, projectId: graph.projectId, specHash: graph.specHash,
    target: target ? compactObject(target) : { objectId: 'spatial.selection', type: 'SpatialSelection' },
    project: { pages: graph.objects.filter(object => object.type === 'PageObject').map(object => ({ objectId: object.objectId, route: object.fields.route })), definitions: graph.objects.filter(object => object.type === 'TransitionDefinition').map(object => ({ objectId: object.objectId, implSymbol: object.fields.implSymbol })), enabledBindings: graph.objects.filter(object => object.type === 'TransitionBinding' && object.fields.enabled === 'true').length },
    siblings, components, invariants: invariants(current.spec), parameters,
    targets: [], baseRevisions: {[getHostConfig(root).specFile]:hash(current.spec)}, evidence: [getHostConfig(root).specFile+':1'], sourceSnippets: [],
    scope: { editable: [], readOnly: [getHostConfig(root).specFile] },
    limitations: [], omitted: [], budget: { maxBytes, actualBytes: 0, method: 'utf8-byte-conservative-proxy-not-model-tokenizer' }
  };
  if (selectedSource) {
    const file = selectedSource.record.file, targetAnchor = anchor?.anchor || { kind: 'structural', path: (await import('../workbench-core/changes/structure.js')).records(selectedSource.source).find(record => record.start === selectedSource.record.range[0]).path };
    if (/^[a-z]/.test(selectedSource.record.tag) && !['script','style','slot'].includes(selectedSource.record.tag)) bundle.targets.push({ objectId: objectId || undefined, file, anchor: targetAnchor, expectedRevision: hash(selectedSource.source), evidence: `${file}:${line(selectedSource.source, selectedSource.record.range[0])}` });
  }
  // A transition has no writable DOM target. Include its actual implementation,
  // parsed as frontmatter (never executed), so analysis can cite real lines.
  const definition = target?.type === 'TransitionBinding' ? byId.get(target.fields.definitionRef) : target?.type === 'TransitionDefinition' ? target : null;
  if (definition) {
    const file = definition.fields.implSource.split(/[:#]/)[0], source = await sourceFile(root, file);
    const program = parse(`---\n${source}\n---\n<div/>`).ast.frontmatter.program;
    let match;
    function walk(n) { if (!n || typeof n !== 'object') return; if (n.type === 'FunctionDeclaration' && n.id?.name === definition.fields.implSymbol) match = n; for (const value of Object.values(n)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value); }
    walk(program);
    if (!match) reject('IMPLEMENTATION_SYMBOL_UNMAPPED');
    const startLine = line(source, match.start - 4), all = source.slice(match.start - 4, match.end - 4).split('\n'), kept = all.slice(0, 200);
    bundle.sourceSnippets.push({ file, startLine, endLine: startLine + kept.length - 1, code: redact(kept.join('\n')), truncated: all.length > 200, omittedLines: all.length > 200 ? [[startLine + 200, startLine + all.length - 1]] : [] });
    bundle.evidence.push(`${file}:${startLine}`); bundle.baseRevisions[file] = hash(source); bundle.scope.readOnly.push(file);
  }
  if (snapshot) {
    const legacy = createTaskService({ root, lookup, readContextFile: file => sourceFile(root, file) });
    const packet = await legacy.context({ snapshot, selection: { route: '/', viewport: { width: 960, height: 540 } } });
    bundle.scope = { editable: bundle.targets.length ? packet.scope.editable : [], readOnly: [...new Set([...packet.scope.readOnly, ...(!bundle.targets.length ? packet.scope.editable : []), getHostConfig(root).specFile])] };
    bundle.capture = { domSummary: packet.context.domSummary, styles: packet.context.styles };
    const seen = new Set();
    for (const snippet of packet.context.sourceSnippets) {
      if (seen.has(snippet.file)) continue; seen.add(snippet.file);
      const source = await sourceFile(root, snippet.file), start = snippet.range[0], startLine = line(source, start), endLine = line(source, snippet.range[1]);
      const lines = source.slice(start, snippet.range[1]).split('\n'), count = Math.min(200, lines.length);
      bundle.sourceSnippets.push({ file: snippet.file, startLine, endLine: startLine + count - 1, code: redact(lines.slice(0, count).join('\n')), truncated: count < lines.length || snippet.truncated, omittedLines: count < lines.length ? [[startLine + count, endLine]] : [] });
      bundle.baseRevisions[snippet.file] = hash(source); bundle.evidence.push(`${snippet.file}:${startLine}`);
    }
    for (const file of [...packet.scope.editable, ...packet.scope.readOnly]) if (!bundle.baseRevisions[file]) bundle.baseRevisions[file] = hash(await sourceFile(root, file));
  }
  for (const target of bundle.targets) { bundle.baseRevisions[target.file] = target.expectedRevision; if (!bundle.evidence.includes(target.evidence)) bundle.evidence.push(target.evidence); }
  if (!bundle.targets.length) bundle.limitations.push('No writable AST target in this object scope: modify must return an explicit clarification, not invented paths.');
  const cost = () => estimateTokens(JSON.stringify(bundle));
  while (cost() > maxBytes && bundle.siblings.length) { bundle.omitted.push({ kind: 'sibling', objectId: bundle.siblings.pop().objectId }); }
  while (cost() > maxBytes && bundle.components.length) { bundle.omitted.push({ kind: 'component', objectId: bundle.components.pop().objectId }); }
  if (cost() > maxBytes && bundle.capture) { delete bundle.capture; bundle.omitted.push({ kind: 'domStyleCapture' }); }
  while (cost() > maxBytes && bundle.sourceSnippets.some(snippet => snippet.code.length > 160)) {
    const snippet = bundle.sourceSnippets.findLast(snippet => snippet.code.length > 160), lines = snippet.code.split('\n'), previousEnd = snippet.endLine;
    if (lines.length > 1) { const kept = Math.max(1, Math.floor(lines.length / 2)); snippet.code = lines.slice(0, kept).join('\n'); snippet.endLine = snippet.startLine + kept - 1; snippet.omittedLines.push([snippet.endLine + 1, previousEnd]); }
    else { snippet.code = snippet.code.slice(0, Math.max(160, Math.floor(snippet.code.length / 2))); snippet.partialLine = true; snippet.omittedLines.push([snippet.startLine, snippet.startLine]); }
    snippet.truncated = true;
  }
  if (cost() > maxBytes) reject('CONTEXT_BUDGET_EXCEEDED', 'Required target and invariants exceed the byte budget; narrow the task explicitly.');
  for (let i = 0; i < 3; i++) bundle.budget.actualBytes = cost();
  if (bundle.budget.actualBytes > maxBytes) reject('CONTEXT_BUDGET_EXCEEDED');
  return bundle;
}
