import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {CONTROL_ORIGIN,isBridgeInit,isRemeasureRequest} from '../src/workbench-core/bridge.js';

const source=(await readFile(new URL('../src/workbench/preview-bridge.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'').replaceAll('import.meta.hot','hot');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function preview(){
 const revision='a'.repeat(64),{document,window}=parseHTML('<html><head><meta name="cw-preview-revision" content="'+revision+'"></head><body><main data-ds-id="main"><section id="zone" data-ds-id="zone"></section><a id="link" data-ds-id="link">link</a></main></body></html>');
 let box={x:100,y:100,width:400,height:300},dispose,fetches=0;
 window.HTMLElement.prototype.getBoundingClientRect=function(){return this.id==='zone'?box:this.id==='link'?{x:100,y:100,width:200,height:200}:{x:0,y:0,width:1000,height:600};};
 const sent=[],measurements=[],intervals=new Map(),parent={postMessage:(data,target)=>sent.push({data,target})};
 Object.defineProperty(window,'parent',{value:parent,configurable:true});
 document.fonts={status:'loaded',ready:Promise.resolve()};
 const dependencies={window,document,CONTROL_ORIGIN,isBridgeInit,isRemeasureRequest,measureSpatial:async(node,raw)=>{measurements.push({id:node.getAttribute('data-ds-id'),raw:structuredClone(raw)});return {rect:raw.rect,layoutFacts:{fontsReady:true},spatial:{geometryFingerprint:'b'.repeat(64)}};},captureContext:()=>({}),fetch:async()=>{fetches++;return {ok:true,json:async()=>({docRevision:revision,transactionPending:false})};},location:{pathname:'/',reload(){throw Error('unexpected navigation');}},scrollX:0,scrollY:0,visualViewport:{width:1000},innerWidth:1000,innerHeight:600,devicePixelRatio:1,requestAnimationFrame:fn=>{fn();return 1;},setInterval:fn=>{intervals.set(1,fn);return 1;},clearInterval:id=>intervals.delete(id),hot:{on(){},dispose:fn=>{dispose=fn;}}};
 new Function(...Object.keys(dependencies),source)(...Object.values(dependencies));
 const emit=(target,type,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});for(const [key,value]of Object.entries(props))Object.defineProperty(event,key,{value});target.dispatchEvent(event);return event;};
 const key=code=>emit(window,'keydown',{altKey:true,code});
 const badge=()=>[...document.body.children].find(node=>node.tagName==='DIV');
 const init=(origin=CONTROL_ORIGIN)=>emit(window,'message',{origin,source:parent,data:{schemaVersion:1,kind:'init',frameEpoch:1,sessionNonce:'c'.repeat(32)}});
 return {window,document,sent,measurements,intervals,emit,key,badge,init,dispose:()=>dispose(),resizeBox:next=>{box=next;},get fetches(){return fetches;}};
}
test('actual preview keyboard handlers toggle box/lasso and dispose overlays and timers',async()=>{
 const p=await preview();assert.equal(p.badge().style.display,'none');
 assert.equal(p.key('KeyS').defaultPrevented,true);assert.match(p.badge().textContent,/^SPATIAL/);assert.equal(p.document.documentElement.style.cursor,'crosshair');
 p.key('KeyL');assert.match(p.badge().textContent,/^LASSO/);assert.equal(p.badge().style.display,'block');
 p.key('KeyL');assert.equal(p.badge().style.display,'none');assert.equal(p.document.documentElement.style.cursor,'');
 p.dispose();assert.equal(p.intervals.size,0);assert.equal(p.document.body.querySelector('svg'),null);
});
test('actual preview empty-space gesture picks the smallest safe container and remeasures normalized coordinates',async()=>{
 const p=await preview();p.init();await flush();p.key('KeyS');
 p.emit(p.document,'pointerdown',{button:0,clientX:150,clientY:150});p.emit(p.document,'pointermove',{clientX:210,clientY:190});p.emit(p.document,'pointerup',{clientX:210,clientY:190});await flush();
 assert.equal(p.measurements.at(-1).id,'zone');assert.deepEqual(p.measurements.at(-1).raw,{kind:'rect',rect:{x:150,y:150,width:60,height:40}});
 assert.match(p.badge().textContent,/选区已捕获/);assert.ok(p.document.querySelector('svg path').getAttribute('d').includes('150 150'));
 p.resizeBox({x:200,y:200,width:800,height:600});await p.intervals.get(1)();await flush();
 assert.deepEqual(p.measurements.at(-1).raw.rect,{x:300,y:300,width:120,height:80});
 assert.ok(p.sent.some(item=>item.data.selection?.parentSourceId==='zone'));assert.ok(p.sent.every(item=>item.target===CONTROL_ORIGIN));p.dispose();
});
test('actual preview rejects foreign init and unsafe empty-space anchors without navigation',async()=>{
 const p=await preview();p.init('https://foreign.invalid');await flush();assert.equal(p.fetches,0);assert.equal(p.sent.length,0);
 p.key('KeyS');p.emit(p.document,'pointerdown',{button:0,clientX:2000,clientY:2000});p.emit(p.document,'pointerup',{clientX:2100,clientY:2100});
 assert.match(p.badge().textContent,/没有可安全插入/);assert.equal(p.document.querySelector('svg path').getAttribute('d'),'');assert.equal(p.measurements.length,0);
 assert.equal(p.emit(p.document,'click').defaultPrevented,true);p.dispose();
});
