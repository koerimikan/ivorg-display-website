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
test('stored semantic fingerprints reject same-path same-tag replacement after external edits',()=>{const source='<div><p>A</p><p>B</p></div>',anchor=indexAnchors(source,'src/pages/test.astro').find(a=>a.path==='/div:0/p:1');check.equal(resolveAnchor(anchor,'<div><p>X</p><p>A</p><p>B</p></div>').state,'unbound');check.equal(resolveAnchor(anchor,source.replace('<p>A','<!-- note --><p>A')).state,'bound');});
const xml=await readFile(new URL('../apps/ivorg-website/workbench/specs/ivorg.spec.xml',import.meta.url),'utf8');
const graph=specToGraph(parseSpec(xml),hash(xml));
const copy=()=>structuredClone(graph);
const get=(g,id)=>g.objects.find(o=>o.objectId===id);
const fixtureInput=(g=graph,id='bnd.home.poster.feature')=>{const binding=get(g,id);return {binding,definition:get(g,binding.fields.definitionRef),seed:1234,specHash:g.specHash,sourceRevision:'a'.repeat(64),targetRevision:'b'.repeat(64),posterCount:4};};

test('Anchors: comment insertion preserves structural identity and attributes/content bind read-only',async()=>{
  const file='src/pages/newsletter.astro',source=await readFile(new URL('../apps/ivorg-website/'+file,import.meta.url),'utf8');const anchor=indexAnchors(source,file).find(a=>a.domId==='editorial');
  const before=resolveAnchor(anchor,source),after=resolveAnchor(anchor,'<!-- heading -->\r\n'+source);check.equal(before.state,'bound');check.equal(after.state,'bound');check.notEqual(before.anchor.range[0],after.anchor.range[0]);
  check.equal(resolveAnchor({file,kind:'attr',domId:'editorial'},source).state,'bound');
  check.equal(resolveAnchor({file,kind:'range',range:[0,8]},source).state,'read-only');
  check.equal(resolveAnchor({file,kind:'content',tag:'h1',text:'IMPOSSIBLE'},source).state,'unbound');
});
