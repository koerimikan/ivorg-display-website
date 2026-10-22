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
