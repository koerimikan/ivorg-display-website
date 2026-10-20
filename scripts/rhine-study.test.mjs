import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSpec} from '../src/workbench-core/objects/l3.js';
import {projectTopology} from '../src/workbench-core/objects/graph.js';
import {rhineLayout,pointSegmentDistance,rhineTracePath} from '../src/workbench/shell/topology-renderer.js';
const topology=projectTopology(validateSpec(readFileSync(new URL('../workbench/specs/ivorg.spec.xml',import.meta.url),'utf8')).graph);
test('specimen preserves all 15 identities,13 cross-page routes,2 initialization interfaces and6px solids',()=>{
 const layout=rhineLayout(topology);assert.equal(layout.panels.length,3);assert.equal(layout.routes.length,15);assert.equal(new Set(layout.routes.map(route=>route.id)).size,15);assert.equal(layout.routes.filter(route=>route.self).length,2);
 for(const panel of layout.panels)assert.equal(panel.depth,6);
});
test('finite corridors avoid every foreign chip with18world-pixel keepout',()=>{
 const {routes}=rhineLayout(topology);for(const route of routes)for(const other of routes){if(route===other)continue;for(let i=1;i<route.points.length;i++)assert.ok(pointSegmentDistance(other.chip,route.points[i-1],route.points[i])>=18,`${route.id} crosses ${other.id}`);}
 for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++)assert.ok(Math.hypot(routes[i].chip.x-routes[j].chip.x,routes[i].chip.y-routes[j].chip.y)>=40);
});
test('routes stay rectilinear or45degrees and use distinct non-overlapping horizontal lanes',()=>{
 const {routes}=rhineLayout(topology),horizontal=[];
 for(const route of routes){assert.match(rhineTracePath(route,routes),/^M /);for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);assert.ok(dx<1e-8||dy<1e-8||Math.abs(dx-dy)<1e-8);if(dy===0)horizontal.push({y:a.y,id:route.id});}}
 assert.equal(new Set(horizontal.map(segment=>segment.y)).size,horizontal.length);
});
test('study rejects incomplete identity graphs rather than silently omitting interfaces',()=>{
 const invalid=structuredClone(topology);invalid.bindings.pop();assert.throws(()=>rhineLayout(invalid),/RHINE_BINDING_CONTRACT/);
 const missing=structuredClone(topology);missing.pages.pop();assert.throws(()=>rhineLayout(missing),/RHINE_PAGE_CONTRACT/);
});
