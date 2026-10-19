import http from 'node:http';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseSpec, specToGraph, hash } from '../src/workbench-core/objects/spec.js';
import { validateGraph, projectTopology } from '../src/workbench-core/objects/graph.js';
import { indexAnchors, resolveAnchor } from '../src/workbench-core/objects/anchors.js';
import { acceptBridgeMessage, isBridgeInit, PREVIEW_ORIGIN, CONTROL_ORIGIN } from '../src/workbench-core/bridge.js';
import { createPosterDeck, mulberry32, createFixtureSession } from '../src/workbench-core/motion/fixture.js';
import { createViewStack } from '../src/workbench-core/view-stack.js';
import { createControlServer, loadProject } from '../src/workbench-server/server.js';
import companionPreview from '../src/workbench-server/preview-integration.js';
import { checkStaticSecurity } from './workbench-p1-security.mjs';

let assertionCalls = 0;
const check = new Proxy(assert, { apply(target,receiver,args){assertionCalls++;return Reflect.apply(target,receiver,args);}, get(target,key){const value=target[key];return typeof value==='function'?(...args)=>{assertionCalls++;return value(...args);}:value;} });
after(()=>console.log(`P1_ASSERTION_CALLS=${assertionCalls}`));
const root=fileURLToPath(new URL('../',import.meta.url));
const xml=await readFile(new URL('../workbench/specs/ivorg.spec.xml',import.meta.url),'utf8');
const graph=specToGraph(parseSpec(xml),hash(xml));
const copy=()=>structuredClone(graph);
const get=(g,id)=>g.objects.find(o=>o.objectId===id);
const fixtureInput=(g=graph,id='bnd.home.poster.feature')=>{const binding=get(g,id);return {binding,definition:get(g,binding.fields.definitionRef),seed:1234,specHash:g.specHash,sourceRevision:'a'.repeat(64),targetRevision:'b'.repeat(64),posterCount:4};};

test('L1: canonical XML is closed, namespace/version/IDs valid, and root documentId resolves',()=>{
  const state=validateGraph(graph);check.equal(graph.objects.length,104);check.equal(state.byId.get('spec.ivorg.workbench').type,'Spec');check.equal(state.objectsOf('PageObject').length,3);check.equal(state.objectsOf('ComponentObject').length,5);check.equal(state.objectsOf('TransitionObject').length,4);check.equal(state.objectsOf('TransitionInstance').length,2);
});
test('L1: malformed XML, unknown elements/attributes, duplicate IDs and namespaces are rejected',()=>{
  for(const bad of [xml.replace('</Spec>',''),xml.replace('<Description>','<Unknown>'),xml.replace('pageKey="home"','unknown="x" pageKey="home"'),xml.replace('id="page.newsletter"','id="page.home"'),xml.replace('xmlns="urn:ivorg:companion:spec"','xmlns="urn:wrong"')])check.throws(()=>parseSpec(bad));
});
test('L1: DTD, entities, processing instructions and remote schema are rejected',()=>{
  for(const prefix of ['<!DOCTYPE Spec [<!ENTITY x SYSTEM "file:///secret">]>','<!ENTITY x "boom">','<?xml-stylesheet href="https://example.invalid"?>'])check.throws(()=>parseSpec(prefix+xml));
  check.throws(()=>parseSpec(xml.replace('specVersion="1.0.0"','schemaLocation="https://example.invalid" specVersion="1.0.0"')));
});
test('L1/L2: typed binding booleans, triggers and numeric parameter ranges are checked',()=>{
  check.throws(()=>parseSpec(xml.replace('enabled="true"','enabled="TRUE"')));check.throws(()=>parseSpec(xml.replace('trigger="click"','trigger="script"')));
  const g=copy();get(g,'td.wipeCover').params.durationMs.value='NaN';check.throws(()=>validateGraph(g),{code:'PARAM_RANGE'});
});
test('L2: dangling IDs and wrong binding target types are rejected',()=>{
  const g=copy();g.references.push({owner:'page.home',field:'ref',target:'cmp.missing'});check.throws(()=>validateGraph(g),{code:'GRAPH_REF'});
  const h=copy();get(h,'bnd.home.poster.feature').fields.toPage='cmp.nav';check.throws(()=>validateGraph(h),{code:'BINDING_REF_TYPE'});
});
test('L2: inheritance and containment use three-color DFS and reject cycles',()=>{
  const g=copy();get(g,'page.home').extendsRef='page.newsletter';get(g,'page.newsletter').extendsRef='page.home';check.throws(()=>validateGraph(g),{code:'INHERITANCE_CYCLE'});
  const h=copy();get(h,'page.home').children.push('cmp.baseCard');get(h,'cmp.baseCard').children.push('page.home');check.throws(()=>validateGraph(h),{code:'CONTAINMENT_CYCLE'});
});
test('L2: HOME to NEWSLETTER and back is a legal navigation cycle',()=>{
  const t=projectTopology(graph);check(t.bindings.some(o=>o.fields.fromPage==='page.home'&&o.fields.toPage==='page.newsletter'));check(t.bindings.some(o=>o.fields.fromPage==='page.newsletter'&&o.fields.toPage==='page.home'));check.doesNotThrow(()=>validateGraph(graph));
});
test('Inheritance: sparse override resolves and inherited locks cannot be overridden',()=>{
  const state=validateGraph(graph);check.equal(state.resolved.get('cmp.homePoster').params.hoverLiftPx.value,10);
  const g=copy();get(g,'cmp.baseCard').params.hoverLiftPx.locked='true';check.throws(()=>validateGraph(g),{code:'OVERRIDE_LOCKED_FIELD'});
  const h=copy();get(h,'cmp.homePoster').overrides.push({field:'__proto__',value:'{}',strategy:'replace'});check.throws(()=>validateGraph(h),{code:'OVERRIDE_LOCKED_FIELD'});
});
test('Topology: 3 pages, 4 adjacencies, 15 enabled binding middle nodes and 30 edges',()=>{
  const t=projectTopology(graph);check.equal(t.pages.length,3);check.equal(t.adjacencies.length,4);check.equal(t.bindings.length,15);check.equal(t.nodes.filter(n=>n.kind==='binding').length,15);check.equal(t.edges.length,30);
  for(const b of t.bindings){check(t.edges.some(e=>e.from===b.fields.fromPage&&e.to===b.objectId));check(t.edges.some(e=>e.from===b.objectId&&e.to===b.fields.toPage));}
});
test('Topology: four selected bindings share td.wipeCover; three page-local HOME to DISCO entrances are distinct',()=>{
  const t=projectTopology(graph);for(const id of ['bnd.home.cta.discography','bnd.home.cta.newsletter','bnd.home.poster.feature','bnd.home.poster.bulletin'])check(t.definitionReuse['td.wipeCover'].includes(id));
  check.equal(t.definitionReuse['td.wipeCover'].length,12);check.equal(new Set(t.homeDiscoEntrances).size,3);check.equal(t.bindings.some(b=>b.objectId==='bnd.news.reader.next'),false);
});
test('Anchors: comment insertion preserves structural identity and attributes/content bind read-only',async()=>{
  const file='src/pages/newsletter.astro',source=await readFile(new URL('../'+file,import.meta.url),'utf8');const anchor=indexAnchors(source,file).find(a=>a.domId==='editorial');
  const before=resolveAnchor(anchor,source),after=resolveAnchor(anchor,'<!-- heading -->\r\n'+source);check.equal(before.state,'bound');check.equal(after.state,'bound');check.notEqual(before.anchor.range[0],after.anchor.range[0]);
  check.equal(resolveAnchor({file,kind:'attr',domId:'editorial'},source).state,'bound');
  check.equal(resolveAnchor({file,kind:'range',range:[0,8]},source).state,'read-only');
  check.equal(resolveAnchor({file,kind:'content',tag:'h1',text:'IMPOSSIBLE'},source).state,'unbound');
});
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
test('Viewport stack restores zoom, pan, scroll and selection across nested drilldown',()=>{
  const views=createViewStack();views.setViewport({zoom:1.4,panX:75,panY:-20,selection:null,scrollX:50,scrollY:220});views.open('transition','bnd.home.poster.feature');views.open('page','page.home');check.equal(views.back().kind,'transition');const restored=views.back();check.equal(restored.kind,'macro');check.deepEqual(restored.viewport,{zoom:1.4,panX:75,panY:-20,selection:'bnd.home.poster.feature',scrollX:50,scrollY:220});
});
test('RNG/deck: known mulberry32 vector, independent cursors and no adjacent repeat at reshuffle',()=>{
  const a=mulberry32(1);check.equal(a(),0.6270739405881613);const first=createPosterDeck(123),second=createPosterDeck(123);const sequence=Array.from({length:20},()=>first.next());check.equal(second.cursor,0);check.deepEqual(Array.from({length:20},()=>second.next()),sequence);for(let i=1;i<sequence.length;i++)check.notEqual(sequence[i],sequence[i-1]);
});
test('Fixture: same bakeKey gives same checksum across sessions despite other session history',async()=>{
  const a=createFixtureSession('sess.alpha'),b=createFixtureSession('sess.beta');const one=await a.bake(fixtureInput());await b.bake({...fixtureInput(),seed:99,deckCursorAtStart:5});const two=await b.bake(fixtureInput());check.equal(one.bakeKey,two.bakeKey);check.equal(one.checksum,two.checksum);check.deepEqual(one.frames,two.frames);check.notEqual(one.instance.instanceId,two.instance.instanceId);
});
test('Fixture: all 15 enabled bindings can bake and repeated seek never changes key/checksum/deck',async()=>{
  const session=createFixtureSession('sess.all');for(const binding of projectTopology(graph).bindings){const result=await session.bake(fixtureInput(graph,binding.objectId));const cursor=session.deckCursor;check(result.frames.length>=91);check.strictEqual(session.seekFrame(30),session.seekFrame(30));check.equal(session.seekTime(500).timeMs,500);check.equal(session.artifact.bakeKey,result.bakeKey);check.equal(session.deckCursor,cursor);check(Object.isFrozen(result.frames[30].state));}
});
test('Fixture: same tick instances get sessionId plus monotonic seq; reroll explicitly changes seed',async()=>{
  const session=createFixtureSession('sess.seq');const a=await session.bake(fixtureInput()),b=await session.bake(fixtureInput()),c=await session.reroll();check.equal(a.checksum,b.checksum);check.notEqual(a.instance.instanceId,b.instance.instanceId);check.equal(b.instance.instanceSeq,a.instance.instanceSeq+1);check.equal(c.seed,b.seed+1);check.notEqual(c.bakeKey,b.bakeKey);
});
test('Fixture: key covers page identity, parameters, viewport, seed, deck size and cursor',async()=>{
  const session=createFixtureSession('sess.keys');const base=await session.bake(fixtureInput());
  for(const input of [{...fixtureInput(),seed:2},{...fixtureInput(),deckCursorAtStart:2},{...fixtureInput(),posterCount:3},{...fixtureInput(),viewport:{w:800,h:600,frameZoom:1,dpr:1}},fixtureInput(graph,'bnd.home.cta.newsletter')])check.notEqual((await session.bake(input)).bakeKey,base.bakeKey);
});
test('Fixture: no global random, real route, DOM or external asset is needed to bake/seek',async()=>{
  const original=Math.random;Math.random=()=>{throw new Error('Global randomness forbidden');};
  try{const session=createFixtureSession('sess.pure');const baked=await session.bake(fixtureInput());check.equal(baked.frames.length,91);check.equal(session.seekFrame(90).state.parallax,'excluded');await session.reroll();check.equal(typeof globalThis.document,'undefined');}finally{Math.random=original;}
});
test('Fixture: invalid seeds, cursor, disabled binding and unsupported definition are rejected',async()=>{
  const session=createFixtureSession('sess.reject');for(const input of [{...fixtureInput(),seed:-1},{...fixtureInput(),deckCursorAtStart:Infinity},fixtureInput(graph,'bnd.news.reader.next')])await check.rejects(()=>session.bake(input));
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
  integration.hooks['astro:config:setup']({command:'dev',config:{root:new URL('../',import.meta.url)},injectScript:(_,code)=>{injected=code;},updateConfig:c=>{plugin=c.vite.plugins[0];}});
  check.match(injected,/preview-bridge/);check.equal(plugin.load(plugin.resolveId('../dev-studio/index.js')),'export {};');
  let middleware;plugin.configureServer({config:{server:{host:'127.0.0.1'}},middlewares:{use:fn=>{middleware=fn;}}});
  for(const route of ['/__dev_studio_api/commit','/__dev_studio_api/undo','/__dev_studio_api/export-task']){const res={end(){}};await middleware({url:route,method:'POST'},res,()=>{throw new Error('Must not pass');});check.equal(res.statusCode,403);}
});
test('Static security: no parent DOM read, wildcard postMessage target or fixture navigate/eval',async()=>{check.deepEqual(await checkStaticSecurity(),{contentDocumentReads:0,wildcardTargets:0,pinnedPostMessageTargets:2,fixtureNavigationCalls:0});});
