import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseSpec, specToGraph, hash } from '../workbench-core/objects/spec.js';
import { validateGraph, projectTopology } from '../workbench-core/objects/graph.js';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { createChangeApi } from './change-api.js';

const assets = {
  '/': ['src/workbench/shell/index.html', 'text/html'],
  '/app.js': ['src/workbench/shell/app.js', 'text/javascript'],
  '/styles.css': ['src/workbench/shell/styles.css', 'text/css'],
  '/changes.js': ['src/workbench/shell/changes.js', 'text/javascript'],
  '/src/workbench-core/bridge.js': ['src/workbench-core/bridge.js', 'text/javascript'],
  '/src/workbench-core/view-stack.js': ['src/workbench-core/view-stack.js', 'text/javascript'],
  '/src/workbench-core/motion/fixture.js': ['src/workbench-core/motion/fixture.js', 'text/javascript'],
  '/src/dev-studio/motion-baker.js': ['src/dev-studio/motion-baker.js', 'text/javascript']
};

export async function sourceRevision(root) {
  const files = [];
  async function visit(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory() && !entry.name.startsWith('workbench')) await visit(file);
      else if (entry.isFile() && /\.(astro|js|css)$/.test(file)) files.push(file);
    }
  }
  await visit('src'); files.sort();
  return hash((await Promise.all(files.map(async file => `${file}\0${hash(await readFile(path.join(root, file)))}`))).join('\n'));
}

export async function loadProject(root) {
  const xml = await readFile(path.join(root, 'workbench/specs/ivorg.spec.xml'), 'utf8');
  const graph = specToGraph(parseSpec(xml), hash(xml)); validateGraph(graph);
  const registry = JSON.parse(await readFile(path.join(root, 'workbench/objects/ivorg.object.json'), 'utf8'));
  if (registry.graph.specHash !== graph.specHash || JSON.stringify(registry.graph) !== JSON.stringify(graph)) throw new Error('Canonical object registry differs from Spec; P1 will not rewrite it');
  const anchors = [];
  for (const entry of registry.anchors) {
    if (![...graph.objects,...(registry.structuralObjects||[])].some(o => o.objectId === entry.objectId) || !/^src\/(?:pages|layouts|components)\/[\w/-]+\.astro$/.test(entry.anchor.file)) throw new Error('Invalid canonical anchor');
    const result = resolveAnchor(entry.anchor, await readFile(path.join(root, entry.anchor.file), 'utf8'));
    anchors.push({ objectId: entry.objectId, ...result });
  }
  return { graph, topology: projectTopology(graph), anchors, sourceRevision: await sourceRevision(root) };
}

export async function createControlServer({ root, port = 4323, enableWrites = false }) {
  root = await realpath(root);
  const project = await loadProject(root);
  const changes = enableWrites ? await createChangeApi(root) : null;
  const sessionId = `sess.${randomUUID()}`;
  const actor = Object.freeze({ userId: 'local-owner', projectId: project.graph.projectId, sessionId,
    scope: 'project-read-only', capabilities: ['analyze','explain','measure'], authenticatedBy: 'trusted-loopback-p1' });
  const events = [{ seq: 1, kind: 'control.ready', actorUserId: actor.userId, projectId: actor.projectId, sessionId }];
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src http://127.0.0.1:4321; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json = (status, value) => { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); return true; };
    try {
      const expectedHost = `127.0.0.1:${server.address()?.port}`;
      if (req.headers.host !== expectedHost || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return json(403, { error:'LOOPBACK_HOST' });
      if (req.headers.origin && req.headers.origin !== `http://${expectedHost}`) return json(403, { error: 'ORIGIN' });
      if(changes && req.url.startsWith('/api/change/')) {
        if(req.method!=='GET'&&req.headers.origin!==`http://${expectedHost}`)return json(403,{error:'ORIGIN'});
        if(await changes(req,new URL(req.url,`http://${expectedHost}`),json))return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error:'P1_READ_ONLY' });
      const url = new URL(req.url, `http://${expectedHost}`);
      if (url.pathname === '/api/health') return json(200, { stage:enableWrites?'P3':'P1', readOnly:!enableWrites, origin:`http://${expectedHost}`, previewOrigin:'http://127.0.0.1:4321', sessionId });
      if (url.pathname === '/api/project') return json(200, { ...(enableWrites?await loadProject(root):project), actor });
      if (url.pathname === '/api/events') return json(200, events);
      if (url.pathname === '/api/analyze') return json(200, { adapter:'HumanOutOfBandAdapter', readOnly:true, pages:project.topology.pages.length, bindings:project.topology.bindings.length, adjacencies:project.topology.adjacencies, unbound:project.anchors.filter(a=>a.state!=='bound') });
      if (url.pathname === '/api/explain') {
        const object = project.graph.objects.find(o=>o.objectId===url.searchParams.get('id'));
        return object ? json(200, { adapter:'HumanOutOfBandAdapter', object, explanation:object.description || `${object.type}: ${object.objectId}`, scope:actor.scope }) : json(404, { error:'OBJECT_NOT_FOUND' });
      }
      const asset = assets[url.pathname];
      if (!asset) return json(404, { error:'NOT_FOUND' });
      const target = await realpath(path.join(root, asset[0]));
      if (!target.startsWith(root + path.sep)) return json(403, { error:'ASSET_BOUNDARY' });
      res.setHeader('Content-Type',`${asset[1]}; charset=utf-8`);
      res.end(req.method === 'HEAD' ? '' : await readFile(target));
    } catch { json(500, { error:'CONTROL_FAILURE' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port,'127.0.0.1',resolve); });
  return { server, project, actor, stop: () => new Promise(resolve=>server.close(resolve)) };
}
