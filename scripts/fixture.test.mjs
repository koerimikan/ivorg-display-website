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
