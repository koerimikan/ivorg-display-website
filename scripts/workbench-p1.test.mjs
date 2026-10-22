import http from 'node:http';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseSpec, specToGraph, hash } from '../packages/atelier/src/workbench-core/objects/spec.js';
import { validateGraph, projectTopology } from '../packages/atelier/src/workbench-core/objects/graph.js';
import { indexAnchors, resolveAnchor } from '../packages/atelier/src/workbench-core/objects/anchors.js';
import { acceptBridgeMessage, isBridgeInit, PREVIEW_ORIGIN, CONTROL_ORIGIN } from '../packages/atelier/src/workbench-core/bridge.js';
import { createPosterDeck, mulberry32, createFixtureSession } from '../packages/atelier/src/workbench-core/motion/fixture.js';
import { createViewStack } from '../packages/atelier/src/workbench-core/view-stack.js';
import { createControlServer, loadProject } from '../packages/atelier/src/workbench-server/server.js';
import companionPreview from '../packages/atelier/src/workbench-server/preview-integration.js';
import { checkStaticSecurity } from './workbench-p1-security.mjs';

let assertionCalls = 0;
const check = new Proxy(assert, { apply(target,receiver,args){assertionCalls++;return Reflect.apply(target,receiver,args);}, get(target,key){const value=target[key];return typeof value==='function'?(...args)=>{assertionCalls++;return value(...args);}:value;} });
after(()=>console.log(`P1_ASSERTION_CALLS=${assertionCalls}`));
const root=fileURLToPath(new URL('../apps/ivorg-website/',import.meta.url));
const xml=await readFile(new URL('../apps/ivorg-website/workbench/specs/ivorg.spec.xml',import.meta.url),'utf8');
const graph=specToGraph(parseSpec(xml),hash(xml));
const copy=()=>structuredClone(graph);
const get=(g,id)=>g.objects.find(o=>o.objectId===id);
const fixtureInput=(g=graph,id='bnd.home.poster.feature')=>{const binding=get(g,id);return {binding,definition:get(g,binding.fields.definitionRef),seed:1234,specHash:g.specHash,sourceRevision:'a'.repeat(64),targetRevision:'b'.repeat(64),posterCount:4};};

const source={},expect={origin:PREVIEW_ORIGIN,source,frameEpoch:3,nonce:'a'.repeat(32),docRevision:'b'.repeat(64)};
const hello={schemaVersion:1,kind:'hello',frameEpoch:3,sessionNonce:'a'.repeat(32),docRevision:'b'.repeat(64),pathname:'/newsletter/'};
const event=data=>({origin:PREVIEW_ORIGIN,source,data});

test('Bridge: accepts exact origin/source/schema/epoch/nonce/document revision only',()=>{
  check.equal(acceptBridgeMessage(event(hello),expect).kind,'hello');
  for(const [ev,reason] of [[{...event(hello),origin:CONTROL_ORIGIN},'ORIGIN'],[{...event(hello),source:{}},'SOURCE'],[event({...hello,schemaVersion:2}),'SCHEMA'],[event({...hello,frameEpoch:2}),'EPOCH'],[event({...hello,sessionNonce:'c'.repeat(32)}),'NONCE'],[event({...hello,docRevision:'d'.repeat(64)}),'STALE_DOC']])check.equal(acceptBridgeMessage(ev,expect).reject,reason);
});
test('Bridge: malformed measures, nonfinite geometry, extra fields and fake IDs fail shape validation',()=>{
  const measure={...hello,kind:'measure',rects:[{x:0,y:0,width:1,height:1}],hitIds:['page.newsletter'],runtimeSourceIds:[]};check.equal(acceptBridgeMessage(event(measure),expect).kind,'measure');
  for(const bad of [{...measure,rects:[{x:NaN,y:0,width:1,height:1}]},{...measure,rects:[{x:0,y:0,width:-1,height:1}]},{...measure,hitIds:[{}]},{...measure,exec:'x'},{...measure,rects:Array(81).fill({x:0,y:0,width:1,height:1})}])check.equal(acceptBridgeMessage(event(bad),expect).reject,'SHAPE');
});
test('Bridge: child handshake verifies parent and pinned control origin',()=>{
  const init={schemaVersion:1,kind:'init',frameEpoch:1,sessionNonce:'a'.repeat(32)};
  check(isBridgeInit({origin:CONTROL_ORIGIN,source,data:init},source));check.equal(isBridgeInit({origin:PREVIEW_ORIGIN,source,data:init},source),false);check.equal(isBridgeInit({origin:CONTROL_ORIGIN,source:{},data:init},source),false);
});
test('Registry: canonical JSON matches Spec and registered AstAnchors bind without rewriting files',async()=>{
  const p=await loadProject(root);check.equal(p.graph.specHash,hash(xml));check.equal(p.anchors.length,13);check.equal(p.anchors.filter(a=>a.state!=='bound').length,0);
});
test('HTTP: loopback control serves only read APIs/assets; refuses mutation, forged Origin and source paths',async t=>{
  const control=await createControlServer({root,port:0});t.after(()=>control.stop());const origin=`http://127.0.0.1:${control.server.address().port}`;
  const health=await fetch(origin+'/api/health');check.equal(health.status,200);check.equal((await health.json()).readOnly,true);
  for(const route of ['/api/project','/api/analyze','/api/events','/api/explain?id=page.home','/','/app.js','/src/workbench-core/motion/fixture.js'])check.equal((await fetch(origin+route)).status,200);
  for(const route of ['/api/commit','/api/undo','/__dev_studio_api/commit','/api/explain?id=../../secret','/src/dev-studio/server.js','/.companion/runtime.json'])check.equal((await fetch(origin+route)).status,404);
  check.equal((await fetch(origin+'/api/project',{method:'POST',body:'{}'})).status,405);check.equal((await fetch(origin+'/api/project',{headers:{Origin:PREVIEW_ORIGIN}})).status,403);check.equal(await new Promise((resolve,reject)=>{const req=http.get(origin+'/api/health',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);}),403);
});
test('Preview plugin: dev-only, legacy HUD replaced and all old write endpoints blocked',async()=>{
  const integration=companionPreview();let injected='',plugin;
  integration.hooks['astro:config:setup']({command:'build'});check.equal(plugin,undefined);
  integration.hooks['astro:config:setup']({command:'dev',config:{root:new URL('../apps/ivorg-website/',import.meta.url)},injectScript:(_,code)=>{injected=code;},updateConfig:c=>{plugin=c.vite.plugins[0];}});
  check.match(injected,/preview-bridge/);check.equal(plugin.load(plugin.resolveId('../dev-studio/index.js')),'export {};');
  let middleware;plugin.configureServer({config:{server:{host:'127.0.0.1'}},middlewares:{use:fn=>{middleware=fn;}}});
  for(const route of ['/__dev_studio_api/commit','/__dev_studio_api/undo','/__dev_studio_api/export-task']){const res={end(){}};await middleware({url:route,method:'POST'},res,()=>{throw new Error('Must not pass');});check.equal(res.statusCode,403);}
});
test('Static security: no parent DOM read, wildcard postMessage target or fixture navigate/eval',async()=>{check.deepEqual(await checkStaticSecurity(),{contentDocumentReads:0,wildcardTargets:0,pinnedPostMessageTargets:2,fixtureNavigationCalls:0});});
