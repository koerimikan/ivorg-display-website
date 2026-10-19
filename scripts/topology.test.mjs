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

test('Topology: 3 pages, 4 adjacencies, 15 enabled binding middle nodes and 30 edges',()=>{
  const t=projectTopology(graph);check.equal(t.pages.length,3);check.equal(t.adjacencies.length,4);check.equal(t.bindings.length,15);check.equal(t.nodes.filter(n=>n.kind==='binding').length,15);check.equal(t.edges.length,30);
  for(const b of t.bindings){check(t.edges.some(e=>e.from===b.fields.fromPage&&e.to===b.objectId));check(t.edges.some(e=>e.from===b.objectId&&e.to===b.fields.toPage));}
});
test('Topology: four selected bindings share td.wipeCover; three page-local HOME to DISCO entrances are distinct',()=>{
  const t=projectTopology(graph);for(const id of ['bnd.home.cta.discography','bnd.home.cta.newsletter','bnd.home.poster.feature','bnd.home.poster.bulletin'])check(t.definitionReuse['td.wipeCover'].includes(id));
  check.equal(t.definitionReuse['td.wipeCover'].length,12);check.equal(new Set(t.homeDiscoEntrances).size,3);check.equal(t.bindings.some(b=>b.objectId==='bnd.news.reader.next'),false);
});
test('Viewport stack restores zoom, pan, scroll and selection across nested drilldown',()=>{
  const views=createViewStack();views.setViewport({zoom:1.4,panX:75,panY:-20,selection:null,scrollX:50,scrollY:220});views.open('transition','bnd.home.poster.feature');views.open('page','page.home');check.equal(views.back().kind,'transition');const restored=views.back();check.equal(restored.kind,'macro');check.deepEqual(restored.viewport,{zoom:1.4,panX:75,panY:-20,selection:'bnd.home.poster.feature',scrollX:50,scrollY:220});
});
