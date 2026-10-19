import {mermaidBundle} from './renderer-bundle.js';
import {sourceRevision} from './project-source.js';
import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseSpec, specToGraph, hash } from '../workbench-core/objects/spec.js';
import { validateGraph, projectTopology } from '../workbench-core/objects/graph.js';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { createChangeApi } from './change-api.js';
import { createSecurity } from './security-api.js';
import {projectObservedObjects} from './registry-identity.js';

const assets = {
  '/': ['src/workbench/shell/index.html', 'text/html'],
  '/topology-renderer.js':['src/workbench/shell/topology-renderer.js','text/javascript'],
  '/app.js': ['src/workbench/shell/app.js', 'text/javascript'],
  '/styles.css': ['src/workbench/shell/styles.css', 'text/css'],
  '/changes.js': ['src/workbench/shell/changes.js', 'text/javascript'],
  '/login.js': ['src/workbench/shell/login.js', 'text/javascript'],
  '/client.js': ['src/workbench/shell/client.js', 'text/javascript'],
  '/memory.js': ['src/workbench/shell/memory.js', 'text/javascript'],
  '/src/workbench-core/bridge.js': ['src/workbench-core/bridge.js', 'text/javascript'],
  '/src/workbench-core/bridge-session.js': ['src/workbench-core/bridge-session.js', 'text/javascript'],
  '/src/dev-studio/task-proposal.js': ['src/dev-studio/task-proposal.js', 'text/javascript'],
  '/src/workbench-core/view-stack.js': ['src/workbench-core/view-stack.js', 'text/javascript'],
  '/src/workbench-core/motion/fixture.js': ['src/workbench-core/motion/fixture.js', 'text/javascript'],
  '/src/dev-studio/motion-baker.js': ['src/dev-studio/motion-baker.js', 'text/javascript']
};

export {sourceManifest,sourceRevision} from './project-source.js';

export async function loadProject(root) {
  const xml = await readFile(path.join(root, 'workbench/specs/ivorg.spec.xml'), 'utf8');
  const graph = specToGraph(parseSpec(xml), hash(xml)); validateGraph(graph);
  const registry = JSON.parse(await readFile(path.join(root, 'workbench/objects/ivorg.object.json'), 'utf8'));
  if (registry.structuralObjects?.length || registry.graph.specHash !== graph.specHash || JSON.stringify(registry.graph) !== JSON.stringify(graph)) throw new Error('Canonical object registry differs from Spec; P1 will not rewrite it');
  const anchors = [];
  for (const entry of registry.anchors) {
    if (![...graph.objects,...(registry.structuralObjects||[])].some(o => o.objectId === entry.objectId) || !/^src\/(?:pages|layouts|components)\/[\w/-]+\.astro$/.test(entry.anchor.file)) throw new Error('Invalid canonical anchor');
    const result = resolveAnchor(entry.anchor, await readFile(path.join(root, entry.anchor.file), 'utf8'));
    anchors.push({ objectId: entry.objectId, ...result });
  }
  const projected=projectObservedObjects(graph,registry);validateGraph(projected);
  const fixtureRevision=hash((await Promise.all(['src/workbench-core/motion/fixture.js','src/dev-studio/motion-baker.js','src/workbench/shell/styles.css'].map(file=>readFile(path.join(root,file),'utf8')))).join('\n'));
  return { fixtureRevision,resolvedObjects:[...validateGraph(projected).resolved.values()], graph:projected, topology: projectTopology(projected), anchors, sourceRevision: await sourceRevision(root) };
}

export async function createControlServer({ root, port = 4323, enableWrites = false }) {
  root = await realpath(root);
  const project = await loadProject(root);
  const security=enableWrites?await createSecurity({root,projectId:project.graph.projectId,specDigest:async()=>hash(await readFile(path.join(root,'workbench/specs/ivorg.spec.xml'),'utf8'))}):null;
  const changes = enableWrites ? await createChangeApi(root,{security}) : null;
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
      if(!['GET','HEAD'].includes(req.method)&&security&&req.headers.origin!==`http://${expectedHost}`)return json(403,{error:'ORIGIN'});
      if(security&&await security.handle(req,new URL(req.url,`http://${expectedHost}`),json,res))return;
      if(changes && req.url.startsWith('/api/change/')) {
        if(req.method!=='GET'&&req.headers.origin!==`http://${expectedHost}`)return json(403,{error:'ORIGIN'});
        if(await changes(req,new URL(req.url,`http://${expectedHost}`),json))return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error:'P1_READ_ONLY' });
      const url = new URL(req.url, `http://${expectedHost}`);
      if (url.pathname === '/api/health') return json(200, { stage:enableWrites?'P4':'P1', readOnly:!enableWrites, origin:`http://${expectedHost}`, previewOrigin:'http://127.0.0.1:4321', sessionId });
      if (url.pathname === '/api/project') return json(200, { ...(enableWrites?await loadProject(root):project), actor:req.actor||actor });
      if (url.pathname === '/api/events') return json(200, events);
      if (url.pathname === '/api/analyze') return json(200, { adapter:'HumanOutOfBandAdapter', readOnly:true, pages:project.topology.pages.length, bindings:project.topology.bindings.length, adjacencies:project.topology.adjacencies, unbound:project.anchors.filter(a=>a.state!=='bound') });
      if (url.pathname === '/api/explain') {
        const object = project.graph.objects.find(o=>o.objectId===url.searchParams.get('id'));
        return object ? json(200, { adapter:'HumanOutOfBandAdapter', object, explanation:object.description || `${object.type}: ${object.objectId}`, scope:actor.scope }) : json(404, { error:'OBJECT_NOT_FOUND' });
      }
      if(url.pathname==='/vendor/mermaid.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await mermaidBundle(root));return;}
      const asset = assets[url.pathname];
      if (!asset) return json(404, { error:'NOT_FOUND' });
      const target = await realpath(path.join(root, asset[0]));
      if (!target.startsWith(root + path.sep)) return json(403, { error:'ASSET_BOUNDARY' });
      res.setHeader('Content-Type',`${asset[1]}; charset=utf-8`);
      res.end(req.method === 'HEAD' ? '' : await readFile(target));
    } catch(error) { json(error.status||500, { error:error.code||'CONTROL_FAILURE' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port,'127.0.0.1',resolve); });
  return { server, project, actor, stop: async () => {await changes?.close();await new Promise(resolve=>server.close(resolve));security?.close();} };
}
