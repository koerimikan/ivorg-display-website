import {getHostConfig} from './host-config.js';
import path from 'node:path';
import { mkdir, cp, lstat, realpath, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { records, parseAst, reject } from '../workbench-core/changes/structure.js';
import { hash } from '../workbench-core/objects/spec.js';
import { validateSpec } from '../workbench-core/objects/l3.js';
import { validateGraph } from '../workbench-core/objects/graph.js';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { projectObservedObjects } from './registry-identity.js';
import { parseRegistry } from './canonical-registry.js';
import { previewBackend, runSnapshotBuild } from './preview-backend.js';
import { dependencyLock } from './dependency-lock.js';

export function unifiedDiff(file, before, after) {
  if (before === after) return '';
  const old = before.split('\n'), next = after.split('\n');
  let prefix = 0, suffix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const lead = Math.min(3, prefix), tail = Math.min(3, suffix), start = prefix - lead;
  const oldEnd = old.length - suffix, newEnd = next.length - suffix;
  return [`--- a/${file}`, `+++ b/${file}`, `@@ -${start + 1},${oldEnd - start + tail} +${start + 1},${newEnd - start + tail} @@`,
    ...old.slice(start, prefix).map(line => ' ' + line), ...old.slice(prefix, oldEnd).map(line => '-' + line),
    ...next.slice(prefix, newEnd).map(line => '+' + line), ...old.slice(oldEnd, oldEnd + tail).map(line => ' ' + line)].join('\n');
}

async function copySnapshot(root, target) {
  const noLinks = async file => !(await lstat(file)).isSymbolicLink();
  for (const file of ['src', 'workbench', 'public']) {
    try { await cp(path.join(root, file), path.join(target, file), { recursive: true, filter: noLinks }); }
    catch (error) { if (file !== 'public' || error.code !== 'ENOENT') throw error; }
  }
  for (const file of ['package.json', 'astro.config.mjs']) {
    const source = path.join(root, file);
    try { if (!await noLinks(source)) reject('PREVIEW_SYMLINK'); await cp(source, path.join(target, file)); }
    catch (error) { if (file !== 'package-lock.json' || error.code !== 'ENOENT') throw error; }
  }
  try { await cp(await dependencyLock(root), path.join(target, 'package-lock.json')); }
  catch (error) { if (error.message !== 'DEPENDENCY_LOCK_REQUIRED') throw error; }
}

async function validateSnapshot(snapshot) {
  const spec = await readFile(path.join(snapshot, getHostConfig(snapshot).specFile), 'utf8');
  const newsletter = await readFile(path.join(snapshot, 'src/pages/newsletter.astro'), 'utf8');
  const canonical = validateSpec(spec, { sourceDemoText: newsletter }).graph;
  const registry = parseRegistry(await readFile(path.join(snapshot, getHostConfig(snapshot).registryFile), 'utf8'), canonical);
  const projected = projectObservedObjects(canonical, registry); validateGraph(projected);
  for (const binding of registry.anchors) {
    if (!/^src\/[\w/-]+\.astro$/.test(binding.anchor.file)) reject('PATH_OUT_OF_SCOPE');
    const source = await readFile(path.join(snapshot, binding.anchor.file), 'utf8');
    if (resolveAnchor(binding.anchor, source).state !== 'bound') reject('PREVIEW_ANCHOR_UNBOUND', binding.objectId);
  }
  return { specDigest: hash(spec), objectCount: projected.objects.length, anchorCount: registry.anchors.length };
}

async function renderedTrees(output) {
  const base = await realpath(output), pages = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), stat = await lstat(file);
      if (stat.isSymbolicLink() || !(await realpath(file)).startsWith(base + path.sep)) reject('PREVIEW_OUTPUT_PATH');
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.html')) {
        if (pages.length >= 200 || stat.size > 1024 * 1024) reject('PREVIEW_OUTPUT_LIMIT');
        const document = parseHTML(await readFile(file, 'utf8')).document;
        const nodes = [];
        function walk(node, parent = null) {
          if (nodes.length >= 20000) reject('PREVIEW_OUTPUT_LIMIT');
          if (node.nodeType === 3 && node.nodeValue.trim()) nodes.push({ type: 'text', parent, value: node.nodeValue });
          else if (node.nodeType === 1) {
            if (['script', 'style'].includes(node.localName)) return;
            const id = nodes.length; nodes.push({ type: 'element', tag: node.localName, parent, href: node.getAttribute('href') });
            for (const child of node.childNodes) walk(child, id);
          }
        }
        walk(document.documentElement); pages.push({ file: path.relative(base, file).replaceAll('\\', '/'), nodes });
      }
    }
  }
  await visit(path.join(output, 'dist'));
  return pages;
}

export async function dryRun(root, plan, { build = true, timeoutMs = 60000 } = {}) {
  const previewId = randomUUID(), snapshot = path.join(root, '.companion/previews', previewId);
  await mkdir(snapshot, { recursive: true });
  const before = path.join(snapshot, 'before'), after = path.join(snapshot, 'after');
  try {
    await copySnapshot(root, before); await cp(before, after, { recursive: true });
    const structure = [];
    for (const change of plan.changes) {
      if (!/^src\/[\w/-]+\.(astro|css)$/.test(change.file) && !(change.canonical && [getHostConfig(root).registryFile, getHostConfig(root).specFile].includes(change.file))) reject('PATH_OUT_OF_SCOPE');
      const file = path.join(after, change.file), actual = await realpath(file);
      if (!actual.startsWith(after + path.sep) || (await lstat(file)).isSymbolicLink()) reject('PREVIEW_PATH');
      if (hash(await readFile(file)) !== change.beforeHash || hash(change.after) !== change.afterHash) reject('REVISION_STALE');
      if (change.file.endsWith('.astro')) {
        parseAst(change.after);
        const project = source => records(source).map(record => ({ path: record.path, tag: record.tag, parentStart: record.parentStart, fingerprint: record.fingerprint }));
        structure.push({ file: change.file, before: project(change.before), after: project(change.after) });
      }
      await writeFile(file, change.after);
    }
    const validation = await validateSnapshot(after);
    const backend = build ? await previewBackend(root) : { available: false, reason: 'Static preview explicitly requested', mode: 'static-ast' };
    let domPreview = null, output = '';
    if (backend.available) {
      const initial = await runSnapshotBuild(snapshot, backend, { timeoutMs, baseline: true });
      const candidate = await runSnapshotBuild(snapshot, backend, { timeoutMs });
      domPreview = { before: await renderedTrees(initial.output), after: await renderedTrees(candidate.output) };
      output = initial.log + candidate.log;
    }
    return { previewId, patchDigest: plan.patchDigest, mode: backend.available ? 'container-ssr' : 'static-ast',
      isolationVerified: backend.available, ssrExecuted: backend.available, buildPassed: backend.available ? true : null,
      staticPassed: true, requiresManualConfirmation: !backend.available, notice: backend.available ? 'Before/after SSR ran in attested network-disabled containers' : `未执行 SSR 预览；仅静态 AST 与结构断言。${backend.reason}`,
      diff: plan.changes.map(c => ({ file: c.file, before: c.before, after: c.after, unified: unifiedDiff(c.file, c.before, c.after) })),
      structuralDiff: structure, impacts: plan.impacts || [], validation, domPreview,
      projectedRevisions: Object.fromEntries(plan.changes.map(c => [c.file, c.afterHash])), output };
  } catch (error) { await rm(snapshot, { recursive: true, force: true }); throw error; }
}
