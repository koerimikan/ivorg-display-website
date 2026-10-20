import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gsap} from 'gsap/gsap-core.js';
import {CAMERA_LIMITS,normalizeWheel,anchoredZoom,projectLabPoint,unprojectLabPoint,projectDustPoint,surveyDustField,surveyGridGeometry,createRhineCamera,createCalibrationSuspension} from '../src/workbench/shell/rhine-camera.source.js';

class Surface extends EventTarget{
 constructor(tag='DIV'){super();this.tagName=tag;this.dataset={};this.parentElement=null;this.capture=null;}
 closest(selector){if(selector.includes('button')&&this.tagName==='BUTTON'||selector.includes('input')&&this.tagName==='INPUT')return this;return this.parentElement?.closest(selector)||null;}
 contains(el){for(let node=el;node;node=node.parentElement)if(node===this)return true;return false;}
 setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=null;}
 getBoundingClientRect(){return {left:44,top:100,width:this.clientWidth,height:this.clientHeight};}
}
const rigs=[];
test('archive keeps four prominent marks with a continuous faint surround and sparse zoomed-out field',()=>{
 const size={width:1280,height:720},state={panX:24,panY:52,zoom:1232/1300,pitch:8,yaw:-5};
 const near=surveyDustField(state,size);assert.equal(near.filter(p=>p.opacity>.4).length,4);assert.ok(near.some(p=>!p.id.startsWith('archive:')&&p.opacity>0&&p.opacity<.3));
 for(const zoom of [.25,.35,.6]){const far=surveyDustField({...state,zoom,panX:640-650*zoom,panY:360-325*zoom},size);assert.ok(far.length>near.length&&far.length<40);assert.ok(far.some(p=>p.opacity>0&&p.opacity<1));}
});
test('sparse infinite dust survives distant pans with stable identities and distinct depth parallax',()=>{
 const size={width:1440,height:900},observedLayers=new Set();
 for(const zoom of [.25,1,3.5])for(const panX of [-100000,0,100000]){
  const state={panX,panY:-80000,zoom},points=surveyDustField(state,size);assert.ok(points.length>=3&&points.length<80);
  assert.deepEqual(points,surveyDustField(state,size));for(const p of points)observedLayers.add(p.layer);
  const shifted=new Map(surveyDustField({...state,panX:panX+1},size).map(p=>[p.id,p]));
  const displacements=[0,1,2].flatMap(layer=>{const p=points.find(p=>p.layer===layer&&shifted.has(p.id));return p?[shifted.get(p.id).x-p.x]:[];});
  assert.ok(displacements.length>=2);for(let i=1;i<displacements.length;i++)assert.ok(displacements[i-1]>displacements[i]);
 }
 assert.equal(observedLayers.size,3);
});
function setup(reduced=false){
 const viewport=new Surface(),doc=new Surface(),win=new Surface(),observers=[],samples=[];
 win.ResizeObserver=class{constructor(fn){this.callback=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 doc.defaultView=win;doc.body=new Surface('BODY');doc.hidden=false;viewport.ownerDocument=doc;viewport.parentElement=doc.body;viewport.clientWidth=1280;viewport.clientHeight=640;
 const rig=createRhineCamera({viewport,reduced:()=>reduced,onChange:state=>samples.push(state)});rigs.push(rig);return{rig,viewport,doc,win,samples,observers};
}
function emit(node,type,properties={},target=node){const event=new Event(type,{cancelable:true});Object.assign(event,properties);Object.defineProperty(event,'target',{value:target});node.dispatchEvent(event);return event;}
function wheel(ctx,extra={}){return emit(ctx.viewport,'wheel',{deltaX:0,deltaY:120,deltaMode:0,ctrlKey:false,shiftKey:false,clientX:744,clientY:400,...extra});}
function advance(seconds=1){gsap.globalTimeline.time(gsap.globalTimeline.time()+seconds);}
function near(a,b,epsilon=1e-5){assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);}
afterEach(()=>{for(const rig of rigs.splice(0))rig.dispose();gsap.globalTimeline.clear();gsap.ticker.sleep();});

test('served camera bundle matches its maintained source and installed GSAP',()=>{
 const run=spawnSync(process.execPath,['scripts/build-rhine-camera.mjs','--check'],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
});

test('wheel pixel,line and page units are normalized before mapping',()=>{
 assert.deepEqual(normalizeWheel({deltaMode:0,deltaX:3,deltaY:4},640),{x:3,y:4});
 assert.deepEqual(normalizeWheel({deltaMode:1,deltaX:3,deltaY:4},640),{x:48,y:64});
 assert.deepEqual(normalizeWheel({deltaMode:2,deltaX:0,deltaY:1},640),{x:0,y:640});
});
test('pointer-anchor invariant holds at corners,negative pans and both zoom clamps',()=>{
 for(const zoom of [.25,.9,1.35,3.5])for(const point of [{x:0,y:0},{x:1200,y:600},{x:472,y:193}])for(const requested of [.01,.25,1.8,3.5,100]){
  const state={panX:-120.75,panY:83.5,zoom,pitch:8,yaw:-5},next=anchoredZoom(state,point,requested);
  near(next.panX+(point.x-state.panX)/state.zoom*next.zoom,point.x,1e-9);near(next.panY+(point.y-state.panY)/state.zoom*next.zoom,point.y,1e-9);assert.ok(next.zoom>=.25&&next.zoom<=3.5);
 }
});
test('telemetry unprojects the tilted z=0 survey plane rather than inventing millimetres',()=>{
 for(const pose of [{pitch:0,yaw:0},{pitch:8,yaw:-5},{pitch:12,yaw:-9}])for(let x=0;x<=1300;x+=130)for(let y=0;y<=650;y+=65){const actual=unprojectLabPoint(projectLabPoint({x,y},pose),pose);near(actual.x,x,1e-8);near(actual.y,y,1e-8);}
});
test('dust at different z depths has distinct dolly scale and translation parallax',()=>{
 const state={panX:0,panY:0,zoom:1,pitch:0,yaw:0},size={width:1280,height:800};
 const nearDust={x:750,y:330,z:-120},farDust={...nearDust,z:-850};
 const a=projectDustPoint(nearDust,state,size),b=projectDustPoint(farDust,state,size),aa=projectDustPoint(nearDust,{...state,panX:100,zoom:1.35},size),bb=projectDustPoint(farDust,{...state,panX:100,zoom:1.35},size);
 assert.ok(a.scale>b.scale);assert.notEqual(aa.scale/a.scale,bb.scale/b.scale);assert.notEqual(aa.x-a.x,bb.x-b.x);
});
test('infinite survey grid covers all viewport edges after long pans at both zoom limits',()=>{
 const size={width:1920,height:1080};
 for(const zoom of [.25,.74,1.35,3.5])for(const pan of [-2500,0,2500]){
  const grid=surveyGridGeometry({panX:pan,panY:pan*.3,zoom,pitch:8,yaw:-5},size);assert.ok(grid.lines.length>10&&grid.lines.length<220);
  const spans=(a,b,value)=>Math.min(a,b)<=value&&Math.max(a,b)>=value;
  assert.ok(grid.lines.some(line=>spans(line.a.x,line.b.x,0)));assert.ok(grid.lines.some(line=>spans(line.a.x,line.b.x,size.width)));assert.ok(grid.lines.some(line=>spans(line.a.y,line.b.y,0)));assert.ok(grid.lines.some(line=>spans(line.a.y,line.b.y,size.height)));
  for(const line of grid.lines)for(const point of [line.a,line.b])assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
 }
});
test('fixed vernier reports real centre displacement and produces a deterministic alignment peak',()=>{
 const size={width:1300,height:650},state={panX:0,panY:0,zoom:1,pitch:0,yaw:0},a=surveyGridGeometry(state,size),b=surveyGridGeometry({...state,panX:37},size);
 near(a.center.x,0);near(a.lock,1);near(b.center.x,-37);assert.notEqual(a.encoderDegrees,b.encoderDegrees);near(b.encoderDegrees,-b.center.x/(b.step*5)*360);assert.ok(b.lock<a.lock);
});
test('vernier suspension follows with viscous lag,limited deflection and an elastic return to zero',()=>{
 const samples=[],mount=createCalibrationSuspension({onUpdate:s=>samples.push(s)});mount.gesture({phase:'move',dx:1000,dy:1000});near(mount.state.x,0);advance(.08);assert.ok(mount.state.x>0&&mount.state.x<18);advance(.2);near(mount.state.x,18);near(mount.state.y,12);near(mount.state.angle,1.2);
 mount.gesture({phase:'end',dx:0,dy:0});assert.equal(mount.state.phase,'settling');advance(.25);assert.ok(Math.abs(mount.state.x)<18);advance(1);near(mount.state.x,0);near(mount.state.y,0);near(mount.state.angle,0);assert.equal(mount.state.phase,'idle');assert.ok(samples.length>4);mount.dispose();
});
test('new drag interrupts return cleanly;reduced motion keeps the instrument centred',()=>{
 const mount=createCalibrationSuspension({onUpdate(){}});mount.gesture({phase:'move',dx:500,dy:0});advance(.2);mount.gesture({phase:'end'});advance(.1);mount.gesture({phase:'move',dx:-500,dy:0});advance(.2);assert.ok(mount.state.x<0);mount.reset();near(mount.state.x,0);mount.dispose();
 const still=createCalibrationSuspension({onUpdate(){},reduced:()=>true});still.gesture({phase:'move',dx:1000,dy:1000});near(still.state.x,0);near(still.state.angle,0);assert.equal(still.state.phase,'idle');still.dispose();
});
test('wheel pan gets a short inertial response;zoom breathes in either direction then settles',()=>{
 const mount=createCalibrationSuspension({onUpdate(){}});mount.gesture({phase:'wheel',kind:'pan',dx:0,dy:-120});advance(.1);assert.ok(mount.state.y<0);advance(.1);advance(1);near(mount.state.y,0);assert.equal(mount.state.phase,'idle');
 for(const direction of [1,-1]){mount.gesture({phase:'wheel',kind:'zoom',zoomDirection:direction});advance(.1);assert.ok(direction*(mount.state.scale-1)>0);advance(.1);advance(1);near(mount.state.scale,1);assert.equal(mount.state.phase,'idle');}mount.dispose();
});
test('plain wheel pans vertically with damping and never changes zoom',()=>{
 const ctx=setup(),before=ctx.rig.state,event=wheel(ctx);assert.equal(event.defaultPrevented,true);near(ctx.rig.state.panY,before.panY);near(ctx.rig.target.panY,before.panY-120);advance();near(ctx.rig.state.panY,before.panY-120);assert.equal(ctx.rig.state.zoom,before.zoom);near(ctx.rig.state.panX,before.panX);
});
test('Shift wheel maps y to x;trackpad x/y retain both pan directions',()=>{
 const ctx=setup(),before=ctx.rig.state;wheel(ctx,{shiftKey:true});advance();near(ctx.rig.state.panX,before.panX-120);near(ctx.rig.state.panY,before.panY);
 wheel(ctx,{deltaX:30,deltaY:50});advance();near(ctx.rig.state.panX,before.panX-150);near(ctx.rig.state.panY,before.panY-50);
});
test('rapid pan packets accumulate the target instead of losing deltas mid-tween',()=>{
 const ctx=setup(),before=ctx.rig.state;wheel(ctx,{deltaY:40});wheel(ctx,{deltaY:40});wheel(ctx,{deltaY:40});advance();near(ctx.rig.state.panY,before.panY-120);
});
test('Ctrl/pinch zoom preserves the pointer throughout actual GSAP easing frames',()=>{
 const ctx=setup(),before=ctx.rig.state,point={x:700,y:300},anchor={x:(point.x-before.panX)/before.zoom,y:(point.y-before.panY)/before.zoom};wheel(ctx,{ctrlKey:true,deltaY:-160});
 const start=ctx.samples.length;for(let i=0;i<5;i++)advance(.04);
 const frames=ctx.samples.slice(start);assert.ok(frames.length>=4);for(const frame of frames){near(frame.panX+anchor.x*frame.zoom,point.x,1e-7);near(frame.panY+anchor.y*frame.zoom,point.y,1e-7);}assert.ok(ctx.rig.state.zoom>before.zoom);
});
test('repeated zoom clamps at0.25/3.5 and anchors against displayed state',()=>{
 const ctx=setup();wheel(ctx,{ctrlKey:true,deltaY:-10000});advance();near(ctx.rig.state.zoom,3.5);
 wheel(ctx,{ctrlKey:true,deltaY:10000});advance();near(ctx.rig.state.zoom,.25);
});
test('focus is a450ms GSAP tween to a centred frontal1.35x page',()=>{
 const ctx=setup();ctx.rig.focus({id:'page.home',x:40,y:110,width:320,height:200});assert.equal(ctx.rig.mode,'focus');assert.ok(gsap.globalTimeline.getChildren().some(tween=>tween.duration()===CAMERA_LIMITS.focusSeconds));advance();
 const state=ctx.rig.state;near(state.zoom,1.35);near(state.pitch,0);near(state.yaw,0);near(state.panX+200*state.zoom,640);near(state.panY+210*state.zoom,320);
});
test('Escape during focus cancels stale completion and restores the exact overview',()=>{
 const ctx=setup(),before=ctx.rig.state;ctx.rig.focus({id:'page.home',x:40,y:110,width:320,height:200});advance(.15);emit(ctx.doc,'keydown',{key:'Escape'});advance();for(const key of Object.keys(before))near(ctx.rig.state[key],before[key]);assert.equal(ctx.rig.mode,'idle');
});
test('switching focus targets retains the original overview for Escape',()=>{
 const ctx=setup(),before=ctx.rig.state;ctx.rig.focus({id:'page.home',x:40,y:110,width:320,height:200});advance(.1);ctx.rig.focus({id:'page.newsletter',x:940,y:110,width:320,height:200});advance();near(ctx.rig.state.panX+1100*1.35,640);ctx.rig.restore();advance();for(const key of Object.keys(before))near(ctx.rig.state[key],before[key]);
});
test('blank left drag interrupts a tween without panning on right click',()=>{
 const ctx=setup();wheel(ctx,{ctrlKey:true,deltaY:-90});advance(.05);const before=ctx.rig.state;
 emit(ctx.viewport,'pointerdown',{pointerId:1,button:2,clientX:200,clientY:200});emit(ctx.viewport,'pointermove',{pointerId:1,clientX:240,clientY:220});assert.equal(ctx.viewport.capture,null);
 emit(ctx.viewport,'pointerdown',{pointerId:2,button:0,clientX:200,clientY:200});emit(ctx.viewport,'pointermove',{pointerId:2,clientX:260,clientY:230});emit(ctx.viewport,'pointerup',{pointerId:2});advance();near(ctx.rig.state.panX,before.panX+60);near(ctx.rig.state.panY,before.panY+30);near(ctx.rig.state.zoom,before.zoom);
});
test('Space permits dragging over a page button and suppresses its click;cancel clears suppression',()=>{
 const ctx=setup(),button=new Surface('BUTTON');button.parentElement=ctx.viewport;
 emit(ctx.viewport,'pointerdown',{pointerId:3,button:0,clientX:200,clientY:200},button);assert.equal(ctx.viewport.capture,null);
 emit(ctx.doc,'keydown',{code:'Space'},button);emit(ctx.viewport,'pointerdown',{pointerId:3,button:0,clientX:200,clientY:200},button);assert.equal(ctx.viewport.capture,3);emit(ctx.viewport,'pointermove',{pointerId:3,clientX:250,clientY:200});emit(ctx.viewport,'pointerup',{pointerId:3});assert.equal(emit(ctx.viewport,'click',{},button).defaultPrevented,true);
 emit(ctx.viewport,'pointerdown',{pointerId:4,button:0,clientX:200,clientY:200},button);emit(ctx.viewport,'pointercancel',{pointerId:4});assert.equal(emit(ctx.viewport,'click',{},button).defaultPrevented,false);
});
test('text inputs retain Space and wheel;reduced motion completes without an active tween',()=>{
 const ctx=setup(true),input=new Surface('INPUT');input.parentElement=ctx.viewport;const before=ctx.rig.state;emit(ctx.viewport,'wheel',{deltaMode:0,deltaX:0,deltaY:99},input);assert.deepEqual(ctx.rig.state,before);
 emit(ctx.doc,'keydown',{code:'Space'},input);assert.equal(ctx.viewport.dataset.space,undefined);ctx.rig.focus({id:'page.home',x:40,y:110,width:320,height:200});assert.equal(ctx.rig.mode,'focused');near(ctx.rig.state.zoom,1.35);assert.equal(gsap.globalTimeline.getChildren().length,0);
});
test('resize during focus recentres the target and Escape restores the world anchor',()=>{
 const ctx=setup(),before=ctx.rig.state;ctx.rig.focus({id:'page.home',x:40,y:110,width:320,height:200});advance(.1);ctx.viewport.clientWidth=1440;ctx.observers[0].callback();advance();near(ctx.rig.state.panX+200*1.35,720);ctx.rig.restore();advance();near(ctx.rig.state.panX,before.panX+80);
});
test('hidden pauses animation;dispose removes listeners and pending animation',()=>{
 const ctx=setup();wheel(ctx);ctx.doc.hidden=true;emit(ctx.doc,'visibilitychange');const before=ctx.rig.state;advance();assert.deepEqual(ctx.rig.state,before);ctx.doc.hidden=false;emit(ctx.doc,'visibilitychange');advance();assert.notEqual(ctx.rig.state.panY,before.panY);ctx.rig.dispose();const last=ctx.rig.state;wheel(ctx);advance();assert.deepEqual(ctx.rig.state,last);assert.equal(ctx.observers[0].disconnected,true);
});
