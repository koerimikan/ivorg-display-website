import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {validateSpec} from '../src/workbench-core/objects/l3.js';
import {projectTopology} from '../src/workbench-core/objects/graph.js';
import {renderAstrolabe,orbitLayout,cubicPoint,generateStars} from '../src/workbench/shell/topology-renderer.js';
import {createViewStack} from '../src/workbench-core/view-stack.js';
import {createFixtureSession,compareNormalized,digest} from '../src/workbench-core/motion/fixture.js';
import {createBridgeSession} from '../src/workbench-core/bridge-session.js';
import {PREVIEW_ORIGIN} from '../src/workbench-core/bridge.js';
import * as rendering from '../src/workbench/shell/topology-renderer.js';
import {loadProject} from '../src/workbench-server/server.js';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),graph=validateSpec(await readFile(new URL('workbench/specs/ivorg.spec.xml',root),'utf8')).graph,topology=projectTopology(graph),objects=new Map(graph.objects.map(object=>[object.objectId,object]));
test('astrolabe renders exactly three circular portals and fifteen independent accessible worldline beacons',()=>{
 const {document,window}=parseHTML('<div id="host"></div>'),host=document.getElementById('host'),opened=[];
 const sky=renderAstrolabe(host,topology,objects,(...args)=>opened.push(args));
 assert.equal(host.querySelectorAll('.portal').length,3);assert.equal(host.querySelectorAll('.worldline').length,15);assert.equal(host.querySelectorAll('.orbit-path').length,15);assert.equal(sky.photons.length,15);
 assert.equal(new Set([...host.querySelectorAll('[data-node-id]')].map(node=>node.dataset.nodeId)).size,18);
 assert.equal(host.querySelectorAll('.worldline rect').length,0);assert.equal(host.querySelectorAll('feTurbulence').length,1);
 for(const binding of topology.bindings){const beacon=host.querySelector(`[data-node-id="${binding.objectId}"]`);beacon.dispatchEvent(new window.Event('click'));assert.deepEqual(opened.at(-1),['transition',binding.objectId]);}
 const key=new window.Event('keydown');Object.defineProperty(key,'key',{value:'Enter'});host.querySelector('[data-node-id="page.newsletter"]').dispatchEvent(key);assert.deepEqual(opened.at(-1),['page','page.newsletter']);
});
test('orbits have unique finite geometry, preserve navigation direction, and fan out all binding identities',()=>{
 const {orbits,positions}=orbitLayout(topology);assert.equal(new Set(orbits.map(orbit=>orbit.path)).size,15);
 for(const orbit of orbits){for(const p of [...orbit.points,orbit.beacon])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.deepEqual(cubicPoint(orbit.points,0),orbit.points[0]);assert.deepEqual(cubicPoint(orbit.points,1),orbit.points[3]);assert.ok(Math.hypot(orbit.points[0].x-positions.get(orbit.binding.fields.fromPage).x,orbit.points[0].y-positions.get(orbit.binding.fields.fromPage).y)<123);}
 for(let i=0;i<orbits.length;i++)for(let j=i+1;j<orbits.length;j++)assert.ok(Math.hypot(orbits[i].beacon.x-orbits[j].beacon.x,orbits[i].beacon.y-orbits[j].beacon.y)>18,'neighbor hit region must not cover another beacon center');
});
test('procedural cosmos keeps 90 percent faint dust with three depth layers and bounded subpixel radii',()=>{
 let seed=9;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),stars=generateStars(520,random);
 assert.equal(stars.length,520);assert.equal(stars.filter(star=>star.bright).length,52);assert.equal(new Set(stars.map(star=>star.z)).size,3);
 for(const star of stars.filter(star=>!star.bright))assert.ok(star.radius>=.5&&star.radius<=1.2&&star.alpha<.5);
});

test('Canvas engine caps DPR, remains static for reduced motion, pauses while hidden and cancels old resize loops',()=>{
 const callbacks=new Map(),events=new Map(),mediaEvents=new Map();let next=0,arcs=0,hidden=false;
 const context={setTransform(){},clearRect(){},beginPath(){},arc(){arcs++;},fill(){},moveTo(){},lineTo(){},stroke(){}};
 const canvas={getContext:()=>context},media={matches:true,addEventListener:(name,fn)=>mediaEvents.set(name,fn)},document={get hidden(){return hidden;},documentElement:{style:{setProperty(){}}},addEventListener:(name,fn)=>events.set(name,fn)},window={addEventListener:(name,fn)=>events.set(name,fn)};
 const values={document,window,matchMedia:()=>media,innerWidth:1000,innerHeight:700,devicePixelRatio:3,generateStars,requestAnimationFrame:fn=>{callbacks.set(++next,fn);return next;},cancelAnimationFrame:id=>callbacks.delete(id)};
 const start=new Function(...Object.keys(values),'return ('+rendering.startCosmos.toString()+');')(...Object.values(values));
 const stop=start(canvas);assert.equal(canvas.width,1750);assert.equal(canvas.height,1225);assert.equal(arcs,520);assert.equal(callbacks.size,0);
 media.matches=false;mediaEvents.get('change')();assert.equal(callbacks.size,1);events.get('resize')();assert.equal(callbacks.size,1);
 hidden=true;events.get('visibilitychange')();assert.equal(callbacks.size,0);hidden=false;events.get('visibilitychange')();assert.equal(callbacks.size,1);stop();assert.equal(callbacks.size,0);
});
test('shell removes pan buttons and exposes full-size preview, three modes and collapsed raw-data surfaces',async()=>{
 const html=await readFile(new URL('src/workbench/shell/index.html',root),'utf8'),css=await readFile(new URL('src/workbench/shell/styles.css',root),'utf8'),{document}=parseHTML(html);
 assert.equal(document.querySelector('[id^=pan-]'),null);assert.equal(document.querySelectorAll('[role=tab]').length,3);assert.equal(document.querySelector('#agent-drawer').hasAttribute('hidden'),true);assert.match(css,/width:90vw;height:88vh/);assert.match(css,/prefers-reduced-motion/);
 assert.equal(document.querySelector('#preview').getAttribute('src'),'http://127.0.0.1:4321/');assert.equal(document.querySelector('#analysis').parentElement.localName,'details');
});

test('actual shell handlers open page modes, preserve camera, bake/seek/reroll a worldline, and never navigate preview during slicing',async()=>{
 const html=await readFile(new URL('src/workbench/shell/index.html',root),'utf8'),{document,window}=parseHTML(html),project=await loadProject(fileURLToPath(root));
 const frames=new Map();let nextFrame=0,focus=null;window.HTMLElement.prototype.focus=function(){focus=this;};window.SVGElement.prototype.focus=function(){focus=this;};
 window.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,width:1300,height:760};};
 document.fonts=[];document.getElementById('preview').contentWindow={postMessage(){}};
 const context={...rendering,document,window,CustomEvent:window.CustomEvent,identity:async()=>({authenticated:true,actor:{userId:'test',role:'owner'}}),request:async path=>path==='/api/project'?project:path==='/api/fixture/session'?{sessionId:'sess.visual.test'}:path.startsWith('/api/explain')?{object:graph.objects.find(o=>o.objectId===new URL(path,'http://local').searchParams.get('id')),explanation:'对象解释'}:{},PREVIEW_ORIGIN,createViewStack,createFixtureSession,compareNormalized,digest,createBridgeSession,startCosmos:()=>()=>{},requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},navigator:{userAgent:'shell-dom-test'},devicePixelRatio:1,CSS:{escape:value=>value},location:{reload(){throw Error('unexpected navigation');}}};
 const source=(await readFile(new URL('src/workbench/shell/app.js',root),'utf8')).replace(/^import .*;\r?$/gm,'');
 await new (Object.getPrototypeOf(async function(){}).constructor)(...Object.keys(context),source)(...Object.values(context));
 assert.equal(document.querySelectorAll('.portal').length,3);const camera=document.querySelector('.graph-world').style.transform;
 document.querySelector('[data-node-id="page.newsletter"]').dispatchEvent(new window.Event('click'));
 assert.equal(document.getElementById('page-stage').hidden,false);assert.equal(new URL(document.getElementById('preview').src).pathname,'/newsletter/');
 document.getElementById('mode-xray').dispatchEvent(new window.Event('click'));assert.equal(document.getElementById('xray-panel').hidden,false);assert.ok(document.querySelectorAll('.xray-tree button').length>1);
 assert.equal(document.getElementById('live-panel').hidden,false);assert.equal(document.getElementById('live-panel').classList.contains('occluded'),true);assert.equal(document.getElementById('live-panel').getAttribute('aria-hidden'),'true');
 document.getElementById('mode-spec').dispatchEvent(new window.Event('click'));assert.equal(document.getElementById('spec-panel').hidden,false);
 document.getElementById('back').dispatchEvent(new window.Event('click'));assert.equal(document.querySelector('.graph-world').style.transform,camera);assert.equal(focus.dataset.nodeId,'page.newsletter');
 const previewRoute=document.getElementById('preview').src;
 document.querySelector('[data-node-id="bnd.home.poster.feature"]').dispatchEvent(new window.Event('click'));
 await new Promise(resolve=>setTimeout(resolve,80));
 assert.ok(document.querySelector('.slicer'));assert.ok(document.querySelector('.poster-geometries'));
 const slider=document.querySelector('.scrubber input');assert.ok(Number(slider.max)>0);slider.value='60';slider.dispatchEvent(new window.Event('input'));const content=document.querySelector('.fixture').textContent;
 slider.value='0';slider.dispatchEvent(new window.Event('input'));slider.value='60';slider.dispatchEvent(new window.Event('input'));assert.equal(document.querySelector('.fixture').textContent,content);
 const before=document.querySelector('.timeline-data pre').textContent;
 [...document.querySelectorAll('.controls button')].find(button=>button.textContent.includes('Reroll')).dispatchEvent(new window.Event('click'));
 await new Promise(resolve=>setTimeout(resolve,80));assert.notEqual(document.querySelector('.timeline-data pre').textContent,before);assert.equal(document.getElementById('preview').src,previewRoute);
 window.dispatchEvent(new window.Event('pagehide'));
});

test('structured Agent drawer enforces preview and explicit static acknowledgement before Apply and preserves cancel during a pending request',async()=>{
 const {document,window}=parseHTML('<html><body><div id="change-mount"></div><div id="spec-mount"></div></body></html>');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const clientSource=(await readFile(new URL('src/workbench/shell/client.js',root),'utf8')).replace(/^export /gm,'');
 const client=await new AsyncFunction('document','window',clientSource+'\nreturn {element,technicalData,presentResult,guardButton};')(document,window);
 const calls=[],plan={changeId:'change.test',entry:'object',changes:[{file:'src/pages/newsletter.astro',before:'<p>before</p>',after:'<p>after</p>'}]};
 let pending,hold=false;
 const request=async(path,data)=>{calls.push({path,data});if(path.endsWith('/agent')){if(hold)await new Promise(resolve=>{pending=resolve;});return {status:'completed',capability:'modify',ops:[{type:'replaceAttrLiteral',file:'src/pages/newsletter.astro',anchor:{kind:'attr',domId:'editorial'},expectedRevision:'a'.repeat(64),name:'class',value:'editorial updated'}],evidence:['src/pages/newsletter.astro:1']};}if(path.endsWith('/plan'))return plan;if(path.endsWith('/preview'))return {mode:'static-ast',requiresManualConfirmation:true,notice:'未执行 SSR',diff:[{file:'src/pages/newsletter.astro',unified:'-before\n+after'}]};if(path.endsWith('/apply'))return {state:'COMMITTED'};if(path.endsWith('/agent-cancel')){pending?.();return {status:'aborted'};}if(path.endsWith('/spec-read'))return {spec:'<Workbench/>',astDrift:[]};return {};};
 const account={authenticated:true,actor:{projectId:'p.test',userId:'owner',role:'owner'}},status={actor:account.actor,capabilities:['view','propose','preview','approve','apply','undo','analyze','explain']};
 const context={document,window,CustomEvent:window.CustomEvent,identity:async()=>account,request,capabilities:async()=>status,refreshCapabilities:async()=>status,guardButton:client.guardButton,el:client.element,presentResult:client.presentResult,technicalData:client.technicalData,sessionStorage:{getItem:()=>null,setItem(){}}};
 const source=(await readFile(new URL('src/workbench/shell/changes.js',root),'utf8')).replace(/^import .*;\r?$/gm,'');await new AsyncFunction(...Object.keys(context),source)(...Object.values(context));
 const find=label=>[...document.querySelectorAll('button')].find(button=>button.textContent===label),click=async label=>{find(label).dispatchEvent(new window.Event('click'));await new Promise(resolve=>setTimeout(resolve,0));};
 assert.equal(find('Apply ↗').disabled,true);const intent=document.querySelector('[aria-label="Companion intent"]');intent.value='调整当前结构';intent.dispatchEvent(new window.Event('input'));
 await click('规划修改 ↗');assert.equal(find('采用 Agent 方案').disabled,false);await click('采用 Agent 方案');assert.equal(document.querySelectorAll('.diff-columns').length,1);
 assert.equal(find('批准').disabled,true);await click('验证预览');assert.equal(find('批准').disabled,true);
 const acknowledgement=document.querySelector('input[type=checkbox]');acknowledgement.checked=true;acknowledgement.dispatchEvent(new window.Event('change'));await click('批准');assert.equal(calls.find(call=>call.path.endsWith('/approve')).data.acknowledgeStatic,true);assert.equal(find('Apply ↗').disabled,false);
 await click('Apply ↗');assert.ok(document.body.textContent.includes('COMMITTED'));assert.equal(find('Apply ↗').disabled,true);await click('Undo');assert.ok(calls.some(call=>call.path.endsWith('/undo')));
 hold=true;find('规划修改 ↗').dispatchEvent(new window.Event('click'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(find('取消 Pi').disabled,false);await click('取消 Pi');assert.ok(calls.some(call=>call.path.endsWith('/agent-cancel')));
 window.dispatchEvent(new window.CustomEvent('companion:spec-open'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(document.querySelector('[aria-label="XML architecture document"]').value,'<Workbench/>');
 const malicious=document.createElement('div');client.presentResult(malicious,{summary:'<img src=x onerror=alert(1)>',changes:[{file:'a',before:'<script>bad()</script>',after:'safe'}]});assert.equal(malicious.querySelector('script,img'),null);assert.ok(malicious.querySelector('details pre'));
});
