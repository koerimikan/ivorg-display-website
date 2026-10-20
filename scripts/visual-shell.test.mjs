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
test('optical depth decoration stays inert and never transforms the interactive camera plane',async()=>{
 const html=await readFile(new URL('src/workbench/shell/index.html',root),'utf8'),css=await readFile(new URL('src/workbench/shell/styles.css',root),'utf8'),{document}=parseHTML(html);
 assert.equal(document.querySelector('.optical-volume').getAttribute('aria-hidden'),'true');
 assert.equal(document.querySelectorAll('.lens-shell').length,2);
 const host=document.createElement('div');renderAstrolabe(host,topology,objects,()=>{});
 assert.equal(host.querySelectorAll('.portal-contact').length,3);
 assert.equal(host.querySelectorAll('.portal-rim-light').length,6);
 assert.equal(host.querySelectorAll('.portal-glass').length,3);
 assert.ok(Math.abs(rendering.glassReflectance(1)-.04)<1e-12);
 assert.equal(rendering.glassReflectance(0),1);
 let previous=0;for(let angle=0;angle<=90;angle++){const reflection=rendering.glassReflectance(Math.cos(angle*Math.PI/180));assert.ok(reflection>=previous&&reflection<=1);previous=reflection;}
 assert.throws(()=>rendering.glassReflectance(NaN));
 assert.throws(()=>rendering.glassReflectance(.5,1));
 assert.equal(host.querySelectorAll('.depth-floor').length,21);
 assert.equal(host.querySelector('.depth-scaffold').getAttribute('aria-hidden'),'true');
 assert.match(css,/\.optical-volume\{[^}]*pointer-events:none/);
 assert.match(css,/\.depth-scaffold\{pointer-events:none/);
 assert.match(css,/html\[data-motion=still\][^}]*\.depth-scaffold\{transform:none\}/);
});
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

test('real page miniatures are three pinned, script-disabled, inert frames with distinct aura and double-diamond signals',()=>{
 const {document}=parseHTML('<div id="host"></div>'),host=document.getElementById('host');renderAstrolabe(host,topology,objects,()=>{});
 const frames=[...host.querySelectorAll('iframe')];assert.equal(frames.length,3);assert.deepEqual(frames.map(frame=>frame.getAttribute('src')),['http://127.0.0.1:4321/','http://127.0.0.1:4321/discography/','http://127.0.0.1:4321/newsletter/']);
 for(const frame of frames){assert.equal(frame.getAttribute('sandbox'),'allow-same-origin');assert.equal(frame.getAttribute('tabindex'),'-1');assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');assert.equal(frame.parentElement.parentElement.hasAttribute('inert'),true);}
 assert.equal(host.querySelector('.miniature'),null);assert.equal(host.querySelectorAll('radialGradient[id^="portal-aura-"]').length,3);assert.equal(host.querySelectorAll('.portal-glass radialGradient').length,3);assert.equal(host.querySelectorAll('.portal-watermark').length,3);assert.equal(host.querySelectorAll('.beacon-core').length,15);
 const invalid=structuredClone(topology);invalid.pages[0].fields.route='https://foreign.invalid/';assert.throws(()=>renderAstrolabe(host,invalid,objects,()=>{}),/MINIATURE_ROUTE_NOT_ALLOWED/);
});

test('in-place bindings have visible nonzero loops outside their portal, and page wireframes prioritize owned zones',()=>{
 const {orbits,positions}=orbitLayout(topology),self=orbits.filter(orbit=>orbit.binding.fields.fromPage===orbit.binding.fields.toPage);assert.equal(self.length,2);
 for(const orbit of self){const center=positions.get(orbit.binding.fields.fromPage);assert.ok(Math.hypot(orbit.beacon.x-center.x,orbit.beacon.y-center.y)>160);const samples=Array.from({length:21},(_,i)=>cubicPoint(orbit.points,i/20));const length=samples.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-samples[i].x,p.y-samples[i].y),0);assert.ok(length>250);}
 for(const page of topology.pages){const rows=rendering.wireframeRows(page,objects);assert.ok(rows.length);assert.equal(rows.some(row=>row.objectId.startsWith('zone.layout')),false);assert.ok(rows.some(row=>row.objectId.startsWith('zone.'+({home:'home',discography:'disco',newsletter:'news'}[page.objectId.split('.').at(-1)]))));}
});

test('Canvas engine caps DPR, remains static for reduced motion, pauses while hidden and cancels old resize loops',()=>{
 const callbacks=new Map(),events=new Map(),mediaEvents=new Map(),samples=[],cssValues=new Map();let next=0,arcs=0,hidden=false,clock=0,cssWrites=0;
 const context={setTransform(){},clearRect(){},beginPath(){},arc(){arcs++;},fill(){},moveTo(){},lineTo(){},stroke(){}};
 const canvas={getContext:()=>context},media={matches:true,addEventListener:(name,fn)=>mediaEvents.set(name,fn)},document={get hidden(){return hidden;},documentElement:{style:{setProperty:(key,value)=>{cssWrites++;cssValues.set(key,value);}}},addEventListener:(name,fn)=>events.set(name,fn)},window={addEventListener:(name,fn)=>events.set(name,fn)};
 const values={document,window,performance:{now:()=>clock},matchMedia:()=>media,innerWidth:1000,innerHeight:700,devicePixelRatio:3,generateStars,requestAnimationFrame:fn=>{callbacks.set(++next,fn);return next;},cancelAnimationFrame:id=>callbacks.delete(id)};
 const start=new Function(...Object.keys(values),'return ('+rendering.startCosmos.toString()+');')(...Object.values(values));
 const stop=start(canvas,()=>null,sample=>samples.push(sample));assert.equal(canvas.width,1750);assert.equal(canvas.height,1225);assert.equal(arcs,520);assert.equal(callbacks.size,0);
 media.matches=false;mediaEvents.get('change')();assert.equal(callbacks.size,1);events.get('resize')();assert.equal(callbacks.size,1);
 const tick=delta=>{clock+=delta;const [id,fn]=[...callbacks][0];callbacks.delete(id);fn(clock);assert.equal(callbacks.size,1);};
 for(let i=0;i<66;i++)tick(1000);assert.equal(samples.at(-1).particles,520);assert.equal(samples.at(-1).schedulingGap,true);
 for(let i=0;i<65;i++)tick(45);assert.equal(samples.at(-1).particles,360);
 for(let i=0;i<40;i++)tick(16);assert.equal(samples.at(-1).particles,520);
 assert.equal(cssWrites,2,'idle stars must not repeatedly invalidate root optical styles');
 events.get('pointermove')({clientX:1000,clientY:700});assert.equal(parseFloat(cssValues.get('--bearing')),0);tick(16);assert.ok(parseFloat(cssValues.get('--bearing'))>0&&parseFloat(cssValues.get('--bearing'))<4);
 const priorEpoch=samples.at(-1).samplingEpoch;events.get('resize')();assert.ok(samples.at(-1).samplingEpoch>priorEpoch);assert.equal(samples.at(-1).frameDelta,0);assert.equal(samples.at(-1).width,1000);
 hidden=true;events.get('visibilitychange')();assert.equal(callbacks.size,0);hidden=false;events.get('visibilitychange')();assert.equal(callbacks.size,1);stop();assert.equal(callbacks.size,0);
});
test('shell removes pan buttons and exposes full-size preview, three modes and collapsed raw-data surfaces',async()=>{
 const html=await readFile(new URL('src/workbench/shell/index.html',root),'utf8'),css=await readFile(new URL('src/workbench/shell/styles.css',root),'utf8'),{document}=parseHTML(html);
 assert.equal(document.querySelector('[id^=pan-]'),null);assert.equal(document.querySelectorAll('[role=tab]').length,3);assert.equal(document.querySelector('#agent-drawer').hasAttribute('hidden'),true);assert.match(css,/width:90vw;height:88vh/);assert.match(css,/prefers-reduced-motion/);
 assert.equal(document.querySelector('#preview').getAttribute('src'),'http://127.0.0.1:4321/');assert.equal(document.querySelector('#analysis').parentElement.localName,'details');
});

test('actual shell handlers open page modes, preserve camera, bake/seek/reroll a worldline, and never navigate preview during slicing',async()=>{
 const html=await readFile(new URL('src/workbench/shell/index.html',root),'utf8'),{document,window}=parseHTML(html),project=await loadProject(fileURLToPath(root));
 const frames=new Map(),observers=[];let nextFrame=0,focus=null,reportMotion;window.HTMLElement.prototype.focus=function(){focus=this;};window.SVGElement.prototype.focus=function(){focus=this;};
 window.innerWidth=1440;window.innerHeight=900;
 window.HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('portal-miniature')?{x:300,y:200,left:300,top:200,width:180,height:180}:{x:48,y:120,left:48,top:120,width:1300,height:760};};
 window.HTMLElement.prototype.setPointerCapture=function(){};
 const frameWindows=new WeakMap();Object.defineProperty(window.HTMLElement.prototype,'contentWindow',{configurable:true,get(){if(!frameWindows.has(this))frameWindows.set(this,{postMessage(){}});return frameWindows.get(this);},set(value){frameWindows.set(this,value);}});
 document.fonts=[];document.getElementById('preview').contentWindow={postMessage(){}};
 const context={...rendering,document,window,CustomEvent:window.CustomEvent,identity:async()=>({authenticated:true,actor:{userId:'test',role:'owner'}}),request:async path=>path==='/api/project'?project:path==='/api/fixture/session'?{sessionId:'sess.visual.test'}:path.startsWith('/api/explain')?{object:graph.objects.find(o=>o.objectId===new URL(path,'http://local').searchParams.get('id')),explanation:'对象解释'}:{},PREVIEW_ORIGIN,createViewStack,createFixtureSession,compareNormalized,digest,createBridgeSession,startCosmos:(canvas,attractor,report)=>{reportMotion=report;return()=>{};},PerformanceObserver:class{static supportedEntryTypes=['longtask','long-animation-frame'];constructor(callback){this.callback=callback;observers.push(this);}observe(options){this.type=options.type;}disconnect(){this.disconnected=true;}},requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}disconnect(){}},navigator:{userAgent:'shell-dom-test'},devicePixelRatio:1,CSS:{escape:value=>value},location:{reload(){throw Error('unexpected navigation');}}};
 const source=(await readFile(new URL('src/workbench/shell/app.js',root),'utf8')).replace(/^import .*;\r?$/gm,'');
 await new (Object.getPrototypeOf(async function(){}).constructor)(...Object.keys(context),source)(...Object.values(context));
 assert.equal(document.querySelectorAll('.portal').length,3);
 const sample={kind:'cosmos',samplingEpoch:1,particles:520,frameDelta:16,drawMs:.4,paused:false,width:1440,height:900,pointerX:0,pointerY:0};
 reportMotion(sample);assert.equal(observers.length,2);
 for(const observer of observers)observer.callback({getEntries:()=>[{startTime:performance.now()+1,duration:180,blockingDuration:120}]});
 reportMotion({...sample,paused:true});assert.equal(document.getElementById('frame-health').dataset.longTasks,'1');assert.equal(document.getElementById('frame-health').dataset.longFrames,'1');assert.equal(document.getElementById('frame-health').dataset.maxBlocking,'120.00');
 document.getElementById('optics-detail').dispatchEvent(new window.Event('click'));assert.equal(document.documentElement.dataset.optics,'lite');assert.equal(document.getElementById('optics-detail').getAttribute('aria-pressed'),'true');
 reportMotion({...sample,paused:true});assert.equal(document.getElementById('frame-health').dataset.longFrames,'0');
 document.getElementById('optics-detail').dispatchEvent(new window.Event('click'));assert.equal(document.documentElement.dataset.optics,'full');
 Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(document.documentElement.dataset.visibility,'hidden');assert.equal(frames.size,0);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(document.documentElement.dataset.visibility,'visible');assert.equal(frames.size,1);
 const graphViewport=document.querySelector('.graph-viewport'),transform=()=>{const values=document.querySelector('.graph-world').style.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\) scale\(([-.\d]+)\)/);return {x:Number(values[1]),y:Number(values[2]),z:Number(values[3])};};
 const dispatch=(type,props,target=graphViewport)=>{const event=new window.Event(type,{bubbles:true,cancelable:true});for(const [key,value]of Object.entries(props))Object.defineProperty(event,key,{value});target.dispatchEvent(event);return event;};
 const initial=transform(),worldUnderPointer={x:(400-initial.x)/initial.z,y:(200-initial.y)/initial.z};
 assert.equal(dispatch('wheel',{deltaY:-120,clientX:448,clientY:320}).defaultPrevented,true);
 const zoomed=transform();assert.ok(zoomed.z>initial.z);assert.ok(Math.abs((400-zoomed.x)/zoomed.z-worldUnderPointer.x)<1e-8);assert.ok(Math.abs((200-zoomed.y)/zoomed.z-worldUnderPointer.y)<1e-8);
 dispatch('pointerdown',{button:0,clientX:100,clientY:100,pointerId:7});dispatch('pointermove',{clientX:150,clientY:170});
 assert.equal(transform().x,zoomed.x+50);assert.equal(transform().y,zoomed.y+70);
 dispatch('pointercancel',{});const cancelled=transform();dispatch('pointermove',{clientX:900,clientY:900});assert.deepEqual(transform(),cancelled);
 dispatch('pointerdown',{button:0,clientX:100,clientY:100,pointerId:8},document.querySelector('.portal'));
 dispatch('pointermove',{clientX:800,clientY:800});assert.deepEqual(transform(),cancelled,'portal interaction must not initiate a canvas drag');
 const camera=document.querySelector('.graph-world').style.transform,miniatures=[...document.querySelectorAll('.miniature-page')];
 document.querySelector('[data-node-id="page.newsletter"]').dispatchEvent(new window.Event('click'));
 assert.equal(document.getElementById('page-stage').style.transformOrigin,'318px 218px');
 assert.equal(document.getElementById('page-stage').hidden,false);assert.equal(new URL(document.getElementById('preview').src).pathname,'/newsletter/');
 assert.equal(document.getElementById('macro-scene').hasAttribute('inert'),true);assert.equal(document.getElementById('macro-scene').getAttribute('aria-hidden'),'true');assert.equal(focus.id,'mode-live');
 document.getElementById('mode-xray').dispatchEvent(new window.Event('click'));assert.equal(document.getElementById('xray-panel').hidden,false);assert.ok(document.querySelectorAll('.xray-tree button').length>1);
 assert.equal(document.getElementById('live-panel').hidden,false);assert.equal(document.getElementById('live-panel').classList.contains('occluded'),true);assert.equal(document.getElementById('live-panel').getAttribute('aria-hidden'),'true');
 const tabKey=new window.Event('keydown',{cancelable:true});Object.defineProperty(tabKey,'key',{value:'ArrowRight'});document.getElementById('mode-xray').dispatchEvent(tabKey);
 assert.equal(tabKey.defaultPrevented,true);assert.equal(document.getElementById('mode-spec').getAttribute('aria-selected'),'true');assert.equal(document.getElementById('mode-spec').getAttribute('tabindex'),'0');assert.equal(document.getElementById('mode-xray').getAttribute('tabindex'),'-1');assert.equal(focus.id,'mode-spec');
 document.getElementById('mode-spec').dispatchEvent(new window.Event('click'));assert.equal(document.getElementById('spec-panel').hidden,false);
 document.getElementById('back').dispatchEvent(new window.Event('click'));assert.equal(document.querySelector('.graph-world').style.transform,camera);assert.equal(focus.dataset.nodeId,'page.newsletter');assert.equal(document.getElementById('macro-scene').hasAttribute('inert'),false);assert.deepEqual([...document.querySelectorAll('.miniature-page')],miniatures);
 const previewRoute=document.getElementById('preview').src;
 document.querySelector('[data-node-id="bnd.home.poster.feature"]').dispatchEvent(new window.Event('click'));
 await new Promise(resolve=>setTimeout(resolve,80));
 assert.ok(document.querySelector('.slicer'));assert.ok(document.querySelector('.poster-geometries'));
 const slider=document.querySelector('.scrubber input');assert.ok(Number(slider.max)>0);assert.equal(slider.disabled,false);assert.equal(focus,slider);slider.value='60';slider.dispatchEvent(new window.Event('input'));const content=document.querySelector('.fixture').textContent;
 slider.value='0';slider.dispatchEvent(new window.Event('input'));slider.value='60';slider.dispatchEvent(new window.Event('input'));assert.equal(document.querySelector('.fixture').textContent,content);
 const before=document.querySelector('.timeline-data pre').textContent;
 [...document.querySelectorAll('.controls button')].find(button=>button.textContent.includes('Reroll')).dispatchEvent(new window.Event('click'));
 await new Promise(resolve=>setTimeout(resolve,80));assert.notEqual(document.querySelector('.timeline-data pre').textContent,before);assert.equal(document.getElementById('preview').src,previewRoute);
 window.dispatchEvent(new window.Event('pagehide'));assert.equal(observers.filter(observer=>observer.disconnected).length,2);
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
