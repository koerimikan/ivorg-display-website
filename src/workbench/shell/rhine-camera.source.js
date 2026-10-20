import {gsap} from 'gsap/gsap-core.js';

export const CAMERA_LIMITS=Object.freeze({minZoom:.25,maxZoom:3.5,focusZoom:1.35,focusSeconds:.45});
const clampZoom=value=>Math.max(CAMERA_LIMITS.minZoom,Math.min(CAMERA_LIMITS.maxZoom,value));
const copy=state=>({panX:state.panX,panY:state.panY,zoom:state.zoom,pitch:state.pitch,yaw:state.yaw});
export function normalizeWheel(event,height){
 const mode=event.deltaMode,unit=mode===1?16:mode===2?height:1;
 return {x:event.deltaX*unit,y:event.deltaY*unit};
}
export function anchoredZoom(state,point,newZoom){
 const zoom=clampZoom(newZoom),world={x:(point.x-state.panX)/state.zoom,y:(point.y-state.panY)/state.zoom};
 return {...copy(state),zoom,panX:point.x-world.x*zoom,panY:point.y-world.y*zoom};
}
export function projectLabPoint(point,pose,perspective=1200){
 const rx=pose.pitch*Math.PI/180,ry=pose.yaw*Math.PI/180,x=point.x-650,y=point.y-325,z=point.z||0;
 const xx=x*Math.cos(ry)+z*Math.sin(ry),zz=-x*Math.sin(ry)+z*Math.cos(ry);
 const yy=y*Math.cos(rx)-zz*Math.sin(rx),depth=y*Math.sin(rx)+zz*Math.cos(rx),w=1-depth/perspective;
 return {x:650+xx/w,y:325+yy/w,z:depth};
}
export function unprojectLabPoint(point,pose,perspective=1200){
 const rx=pose.pitch*Math.PI/180,ry=pose.yaw*Math.PI/180,u=point.x-650,v=point.y-325;
 const a=Math.cos(ry)-u*Math.sin(ry)*Math.cos(rx)/perspective,b=u*Math.sin(rx)/perspective;
 const c=Math.sin(ry)*Math.sin(rx)-v*Math.sin(ry)*Math.cos(rx)/perspective,d=Math.cos(rx)+v*Math.sin(rx)/perspective,det=a*d-b*c;
 if(Math.abs(det)<1e-8)throw Error('CAMERA_PROJECTION_SINGULAR');
 return {x:650+(u*d-b*v)/det,y:325+(a*v-u*c)/det};
}
export function projectDustPoint(point,state,size){
 const rx=state.pitch*Math.PI/180,ry=state.yaw*Math.PI/180,x=point.x-650,y=point.y-325,z=point.z;
 const xx=x*Math.cos(ry)+z*Math.sin(ry)+650,zz=-x*Math.sin(ry)+z*Math.cos(ry);
 const yy=y*Math.cos(rx)-zz*Math.sin(rx)+325,depth=y*Math.sin(rx)+zz*Math.cos(rx);
 const factor=1200/(1200/state.zoom-depth),cx=size.width/2,cy=size.height/2;
 return {x:cx+(xx-(cx-state.panX)/state.zoom)*factor,y:cy+(yy-(cy-state.panY)/state.zoom)*factor,scale:factor};
}

// Infinite camera-facing depth planes; only visible seeded world cells are visited.
export function surveyDustField(state,size){
 const points=[],spacing=535,padding=8,cx=size.width/2,cy=size.height/2;
 for(const [layer,depth]of [-120,-400,-850].entries()){
  const scale=1200/(1200/state.zoom-depth),cameraX=(cx-state.panX)/state.zoom,cameraY=(cy-state.panY)/state.zoom;
  const minX=Math.floor((cameraX+(-padding-cx)/scale)/spacing),maxX=Math.floor((cameraX+(size.width+padding-cx)/scale)/spacing);
  const minY=Math.floor((cameraY+(-padding-cy)/scale)/spacing),maxY=Math.floor((cameraY+(size.height+padding-cy)/scale)/spacing);
  for(let row=minY;row<=maxY;row++)for(let col=minX;col<=maxX;col++){
   let seed=(Math.imul(col,73856093)^Math.imul(row,19349663)^Math.imul(layer+1,83492791))>>>0;
   const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   const x=cx+((col+.15+random()*.7)*spacing-cameraX)*scale,y=cy+((row+.15+random()*.7)*spacing-cameraY)*scale;
   const radius=1.2+random()*.6,gold=random()<.2,star=random()<.15,rank=random();
   const density=Math.min(1,(state.zoom/.85)**2),fade=Math.min(1,Math.max(0,(density-rank)/.1+.5));
   if(fade>0&&x>=-padding&&y>=-padding&&x<=size.width+padding&&y<=size.height+padding)points.push({x,y,radius,gold,star,layer,opacity:fade*fade*(3-2*fade),id:`${layer}:${col}:${row}`});
  }
 }
 // A continuous elliptical falloff, never a cleared rectangle or empty annulus.
 // Seeded zoom thinning prevents a wide view from accumulating dense dust.
 for(const point of points){
  const world=unprojectLabPoint({x:(point.x-state.panX)/state.zoom,y:(point.y-state.panY)/state.zoom},{pitch:state.pitch||0,yaw:state.yaw||0});
  const distance=((world.x-650)/900)**2+((world.y-325)/500)**2;
  point.opacity*=.025+.69*(1-Math.exp(-distance*.22));
 }
 for(const [index,point]of [{x:120,y:365,z:-120},{x:780,y:370,z:-400},{x:1090,y:540,z:-850},{x:430,y:540,z:-120}].entries()){
  const p=projectDustPoint(point,state,size);
  if(p.x>=-padding&&p.y>=-padding&&p.x<=size.width+padding&&p.y<=size.height+padding)points.push({...p,radius:1.3,gold:index===1,star:index===2,opacity:1,layer:index%3,id:`archive:${index}`});
 }
 return points.filter(point=>point.opacity>0);
}

export function surveyGridGeometry(state,size){
 const corners=[{x:0,y:0},{x:size.width,y:0},{x:0,y:size.height},{x:size.width,y:size.height}].map(p=>unprojectLabPoint({x:(p.x-state.panX)/state.zoom,y:(p.y-state.panY)/state.zoom},state));
 const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const required=Math.max(26/state.zoom,(maxX-minX)/100,(maxY-minY)/100),power=10**Math.floor(Math.log10(required)),step=[1,2,5,10].map(v=>v*power).find(v=>v>=required);
 const screen=point=>{const p=projectLabPoint(point,state);return {x:state.panX+p.x*state.zoom,y:state.panY+p.y*state.zoom};};
 const lines=[];
 for(let index=Math.floor((minX-650)/step)-1;index<=Math.ceil((maxX-650)/step)+1;index++){const x=650+index*step;lines.push({axis:'x',index,value:index*step,major:index%5===0,origin:index===0,a:screen({x,y:minY-step}),b:screen({x,y:maxY+step})});}
 for(let index=Math.floor((minY-325)/step)-1;index<=Math.ceil((maxY-325)/step)+1;index++){const y=325+index*step;lines.push({axis:'y',index,value:index*step,major:index%5===0,origin:index===0,a:screen({x:minX-step,y}),b:screen({x:maxX+step,y})});}
 const center=unprojectLabPoint({x:(size.width/2-state.panX)/state.zoom,y:(size.height/2-state.panY)/state.zoom},state);
 const x=center.x-650,y=center.y-325,nearest=Math.round(x/step)*step,error=x-nearest,lock=Math.exp(-((error/(step*.08))**2));
 return {step,lines,center:{x,y},encoderDegrees:-x/(step*5)*360,alignmentError:error,lock};
}

export function createCalibrationSuspension({onUpdate,reduced=()=>false}){
 const state={x:0,y:0,angle:0,scale:1};let tween=null,release=null,disposed=false,phase='idle';
 const publish=()=>{if(!disposed)onUpdate({...state,phase});};
 function gesture(event){
  if(disposed)return;tween?.kill();release?.kill();release=null;
  if(reduced()){Object.assign(state,{x:0,y:0,angle:0,scale:1});phase='idle';publish();return;}
  const wheel=event.phase==='wheel',moving=event.phase==='move'||event.phase==='start'||wheel;phase=wheel?'wheel':moving?'drag':'settling';
  const goal=moving?{x:Math.max(-18,Math.min(18,(event.dx||0)*.035)),y:Math.max(-12,Math.min(12,(event.dy||0)*.035)),angle:Math.max(-1.2,Math.min(1.2,(event.dx||0)*.007)),scale:wheel&&event.kind==='zoom'?1+.018*(event.zoomDirection||0):1}:{x:0,y:0,angle:0,scale:1};
  tween=gsap.to(state,{...goal,duration:wheel?.12:moving?.16:.7,ease:moving?'power2.out':'elastic.out(1,.65)',overwrite:true,onUpdate:publish,onComplete:()=>{if(!moving)phase='idle';publish();}});publish();
  if(wheel)release=gsap.delayedCall(.14,()=>{release=null;gesture({phase:'end'});});
 }
 function reset(){tween?.kill();release?.kill();release=null;Object.assign(state,{x:0,y:0,angle:0,scale:1});phase='idle';publish();}
 return {gesture,reset,dispose(){tween?.kill();release?.kill();disposed=true;},get state(){return {...state,phase};}};
}

export function createRhineCamera({viewport,onChange,onTelemetry=()=>{},reduced=()=>false,onFocus=()=>{},onGesture=()=>{}}){
 const doc=viewport.ownerDocument,win=doc.defaultView,abort=new AbortController();
 const state={panX:0,panY:0,zoom:1,pitch:8,yaw:-5};
 let target=copy(state),tween=null,generation=0,mode='idle',overview=null,focusPanel=null,spaceHeld=false,drag=null,suppressClickUntil=0,disposed=false;
 let size={width:0,height:0},pointer={x:0,y:0};
 const on=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:abort.signal});
 const editable=el=>Boolean(el?.closest?.('input,textarea,select,[contenteditable=true]'));
 function telemetry(){const p=unprojectLabPoint({x:(pointer.x-state.panX)/state.zoom,y:(pointer.y-state.panY)/state.zoom},state);onTelemetry({x:p.x-650,y:p.y-325,perspective:1200,unit:'WORLD CSS PX'});}
 function publish(){if(disposed)return;onChange({...copy(state),mode,focusedPageId:focusPanel?.id||null});telemetry();}
 function stop(){++generation;tween?.kill();tween=null;target=copy(state);}
 function transition(next,duration,nextMode,anchor=null){
  stop();mode=nextMode;target={...copy(state),...next};const token=generation;
  const complete=()=>{if(token!==generation||disposed)return;Object.assign(state,target);mode=nextMode==='focus'?'focused':'idle';tween=null;publish();};
  if(reduced()){Object.assign(state,target);if(anchor){state.panX=anchor.screen.x-anchor.world.x*state.zoom;state.panY=anchor.screen.y-anchor.world.y*state.zoom;}complete();return;}
  const properties=anchor?{zoom:target.zoom}:Object.fromEntries(Object.keys(next).map(key=>[key,target[key]]));
  tween=gsap.to(state,{...properties,duration,ease:nextMode==='focus'||nextMode==='restore'?'power3.inOut':'power2.out',overwrite:true,onUpdate:()=>{if(token!==generation)return;if(anchor){state.panX=anchor.screen.x-anchor.world.x*state.zoom;state.panY=anchor.screen.y-anchor.world.y*state.zoom;}publish();},onComplete:complete});
  publish();
 }
 function fit(immediate=false){
  const zoom=clampZoom(Math.min(1.35,(viewport.clientWidth-48)/1300,(viewport.clientHeight-10)/650));
  overview=null;focusPanel=null;onFocus(null);const next={zoom,panX:(viewport.clientWidth-1300*zoom)/2,panY:(viewport.clientHeight-650*zoom)/2,pitch:8,yaw:-5};
  if(immediate){stop();Object.assign(state,next);target=copy(state);mode='idle';publish();}else transition(next,.45,'restore');
 }
 function focus(panel){
  if(disposed)return;
  if(!overview)overview={...copy(state),width:viewport.clientWidth,height:viewport.clientHeight};
  focusPanel=panel;onFocus(panel.id);
  const center=projectLabPoint({x:panel.x+panel.width/2,y:panel.y+panel.height/2,z:panel.z||0},{pitch:0,yaw:0});
  transition({panX:viewport.clientWidth/2-center.x*1.35,panY:viewport.clientHeight/2-center.y*1.35,zoom:1.35,pitch:0,yaw:0},.45,'focus');
 }
 function restore(){if(!overview)return;const saved=overview;overview=null;focusPanel=null;onFocus(null);transition({...copy(saved),panX:saved.panX+(viewport.clientWidth-saved.width)/2,panY:saved.panY+(viewport.clientHeight-saved.height)/2},.45,'restore');}
 function wheel(event){
  if(disposed||editable(event.target))return;event.preventDefault();
  const delta=normalizeWheel(event,viewport.clientHeight),rect=viewport.getBoundingClientRect();pointer={x:event.clientX-rect.left,y:event.clientY-rect.top};
  if(event.ctrlKey){
   const logicalZoom=mode==='zoom'?target.zoom:state.zoom,next=anchoredZoom(state,pointer,logicalZoom*Math.exp(-delta.y*.002));
   transition(next,.18,'zoom',{screen:{...pointer},world:{x:(pointer.x-state.panX)/state.zoom,y:(pointer.y-state.panY)/state.zoom}});
   onGesture({phase:'wheel',kind:'zoom',dx:0,dy:0,zoomDirection:-Math.sign(delta.y)});
  }else{
   const base=mode==='pan'?target:state,dx=event.shiftKey?(delta.y||delta.x):delta.x,dy=event.shiftKey?0:delta.y;
   transition({panX:base.panX-dx,panY:base.panY-dy},.18,'pan');
   onGesture({phase:'wheel',kind:'pan',dx:-dx,dy:-dy});
  }
 }
 on(viewport,'wheel',wheel,{passive:false});
 on(viewport,'pointerdown',event=>{
  if(event.button!==0||editable(event.target)||!spaceHeld&&event.target.closest('button'))return;
  stop();mode='drag';drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX:state.panX,panY:state.panY,moved:false};suppressClickUntil=spaceHeld?Infinity:0;
  onGesture({phase:'start',dx:0,dy:0});
  event.preventDefault();if(spaceHeld)event.stopPropagation();viewport.setPointerCapture(event.pointerId);viewport.dataset.dragging='true';
 },{capture:true});
 on(viewport,'pointermove',event=>{
  const rect=viewport.getBoundingClientRect();pointer={x:event.clientX-rect.left,y:event.clientY-rect.top};
  if(drag&&event.pointerId===drag.id){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved||=Math.hypot(dx,dy)>3;if(drag.moved)suppressClickUntil=Infinity;transition({panX:drag.panX+dx,panY:drag.panY+dy},.1,'drag');onGesture({phase:'move',dx,dy});}
  telemetry();
 });
 function endDrag(event){if(!drag||event.pointerId!==drag.id)return;const id=drag.id;drag=null;if(suppressClickUntil)suppressClickUntil=event.type==='pointercancel'?0:performance.now()+180;if(viewport.hasPointerCapture?.(id))viewport.releasePointerCapture(id);delete viewport.dataset.dragging;onGesture({phase:'end',dx:0,dy:0});}
 on(viewport,'pointerup',endDrag);on(viewport,'pointercancel',endDrag);on(viewport,'lostpointercapture',()=>{if(drag)onGesture({phase:'end',dx:0,dy:0});drag=null;delete viewport.dataset.dragging;});
 on(viewport,'click',event=>{if(performance.now()<suppressClickUntil){suppressClickUntil=0;event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 on(doc,'keydown',event=>{
  if(editable(event.target))return;
  if(event.code==='Space'&&(viewport.contains(event.target)||event.target===doc.body)){spaceHeld=true;viewport.dataset.space='true';event.preventDefault();}
  if(event.key==='Escape'){restore();}
  if(event.target===viewport&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const step=event.shiftKey?50:12,base=mode==='pan'?target:state;transition({panX:base.panX+(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0),panY:base.panY+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)},.15,'pan');}
 });
 on(doc,'keyup',event=>{if(event.code==='Space'){spaceHeld=false;delete viewport.dataset.space;}});
 on(win,'blur',()=>{spaceHeld=false;const id=drag?.id;drag=null;if(id!==undefined){if(viewport.hasPointerCapture?.(id))viewport.releasePointerCapture(id);onGesture({phase:'end',dx:0,dy:0});}suppressClickUntil=0;delete viewport.dataset.space;delete viewport.dataset.dragging;});
 on(doc,'visibilitychange',()=>{if(doc.hidden)tween?.pause();else tween?.resume();});
 const resize=new win.ResizeObserver(()=>{
  const next={width:viewport.clientWidth,height:viewport.clientHeight};
  if(!size.width){size=next;pointer={x:next.width/2,y:next.height/2};fit(true);return;}
  if(next.width===size.width&&next.height===size.height)return;
  const focusing=mode==='focus';stop();state.panX+=(next.width-size.width)/2;state.panY+=(next.height-size.height)/2;size=next;target=copy(state);mode='idle';publish();if(focusing&&focusPanel)focus(focusPanel);
 });resize.observe(viewport);
 // ResizeObserver is asynchronous; initialize before the first interaction.
 size={width:viewport.clientWidth,height:viewport.clientHeight};pointer={x:size.width/2,y:size.height/2};fit(true);
 function dispose(){if(disposed)return;stop();disposed=true;resize.disconnect();abort.abort();}
 on(win,'pagehide',dispose,{once:true});
 function zoomTo(zoom,point={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){transition(anchoredZoom(state,point,zoom),.18,'zoom',{screen:point,world:{x:(point.x-state.panX)/state.zoom,y:(point.y-state.panY)/state.zoom}});}
 return {focus,restore,zoomTo,fit:()=>fit(false),dispose,get state(){return copy(state);},get target(){return {...target};},get mode(){return mode;}};
}
