import {renderTopology,wireframeRows,renderAstrolabe,cubicPoint,startCosmos,svgNode,renderRhineStudy} from '/topology-renderer.js';
import { PREVIEW_ORIGIN } from '/src/workbench-core/bridge.js';
import { createFixtureSession, compareNormalized, digest } from '/src/workbench-core/motion/fixture.js';
import { createViewStack } from '/src/workbench-core/view-stack.js';
import {createBridgeSession} from '/src/workbench-core/bridge-session.js';
import {identity,request} from '/client.js';

const rhineMode=new URLSearchParams(location.search).get('study')==='rhine';
if(rhineMode)document.documentElement.dataset.study='rhine';
const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
let rhineScene,rhineRoot;
if(rhineMode){const layer=node('div',undefined,'rl-stage-layer');for(const id of ['toolbar','page-stage','agent-drawer','detail-scene'])layer.append($(id));document.body.append(layer);}
let attractor=null;
let staticObservation=false,lastMetricsUpdate=0,metricsEpoch=null;
const performanceSamples=[];
let healthWindowStart=performance.now(),longTasks=0,longFrames=0,maxBlocking=0;
const healthObservers=[],healthTypes=typeof PerformanceObserver==='function'?PerformanceObserver.supportedEntryTypes||[]:[];
for(const type of ['longtask','long-animation-frame'])if(healthTypes.includes(type)){
 const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(entry.startTime<healthWindowStart)continue;if(type==='longtask')longTasks++;else{longFrames++;maxBlocking=Math.max(maxBlocking,entry.blockingDuration||0);}}});
 observer.observe({type,buffered:false});healthObservers.push(observer);
}
function recordPerformance(sample){
 if(sample.samplingEpoch!==metricsEpoch){performanceSamples.length=0;lastMetricsUpdate=0;metricsEpoch=sample.samplingEpoch;healthWindowStart=performance.now();longTasks=0;longFrames=0;maxBlocking=0;}
 if(sample.kind==='cosmos'&&!sample.paused&&sample.frameDelta>0){performanceSamples.push(sample);if(performanceSamples.length>240)performanceSamples.shift();}
 const now=performance.now();if(now-lastMetricsUpdate<1000&&!sample.paused)return;lastMetricsUpdate=now;
 const percentile=key=>{const values=performanceSamples.map(value=>value[key]).filter(Number.isFinite).sort((a,b)=>a-b);return values.length?values[Math.floor((values.length-1)*.95)].toFixed(2):'—';};
 const gaps=performanceSamples.filter(value=>value.schedulingGap).length;
 const health=$('frame-health');if(health){health.textContent=`MAIN THREAD / long tasks ${healthTypes.includes('longtask')?longTasks:'unsupported'} · long frames ${healthTypes.includes('long-animation-frame')?longFrames:'unsupported'} · max blocking ${healthTypes.includes('long-animation-frame')?maxBlocking.toFixed(2)+' ms':'unsupported'}`;health.dataset.longTasks=String(longTasks);health.dataset.longFrames=String(longFrames);health.dataset.maxBlocking=maxBlocking.toFixed(2);health.dataset.supported=healthTypes.filter(type=>['longtask','long-animation-frame'].includes(type)).join(',');}
 const output=$('motion-stats');if(output){output.textContent=`${sample.particles} particles · n=${performanceSamples.length} · rAF P95 ${percentile('frameDelta')} ms · Canvas CPU P95 ${percentile('drawMs')} ms · long gaps ${gaps}${sample.paused?' · STATIC':''}`;output.dataset.samples=String(performanceSamples.length);output.dataset.rafP95=percentile('frameDelta');output.dataset.canvasP95=percentile('drawMs');output.dataset.particles=String(sample.particles);output.dataset.mode=sample.paused?'static':'animated';output.dataset.schedulingGaps=String(gaps);output.dataset.width=String(sample.width);output.dataset.height=String(sample.height);output.dataset.epoch=String(sample.samplingEpoch);}
 const ra=$('ra-value'),dec=$('dec-value');if(ra){const hours=((12+sample.pointerX*24)%24+24)%24;ra.textContent=`${String(Math.floor(hours)).padStart(2,'0')}h ${String(Math.floor(hours%1*60)).padStart(2,'0')}m`;}if(dec)dec.textContent=`${sample.pointerY>0?'−':'+'}${Math.abs(sample.pointerY*90).toFixed(1)}°`;
}
const stopCosmos=rhineMode?Object.assign(()=>{},{setPaused(){}}):startCosmos($('cosmos'),()=>attractor,recordPerformance);
function setVisibilityMode(){document.documentElement.dataset.visibility=document.hidden?'hidden':'visible';}
setVisibilityMode();document.addEventListener('visibilitychange',setVisibilityMode);
const epoch=$('epoch-value');if(epoch){const now=new Date(),year=now.getUTCFullYear();epoch.textContent=(year+(now-Date.UTC(year,0,1))/(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))).toFixed(4);}
const motionToggle=$('cosmos-motion');motionToggle?.addEventListener('click',()=>{staticObservation=!staticObservation;document.documentElement.dataset.motion=staticObservation?'still':'live';motionToggle.setAttribute('aria-pressed',String(staticObservation));motionToggle.textContent=staticObservation?'恢复动态':'静态观测';stopCosmos.setPaused?.(staticObservation);window.dispatchEvent(new CustomEvent('companion:motion'));});
const detailToggle=$('optics-detail');detailToggle?.addEventListener('click',()=>{const lite=document.documentElement.dataset.optics!=='lite';document.documentElement.dataset.optics=lite?'lite':'full';detailToggle.setAttribute('aria-pressed',String(lite));detailToggle.textContent=lite?'恢复完整光学':'轻量光学';metricsEpoch=null;performanceSamples.length=0;lastMetricsUpdate=0;});
const drawer=$('agent-drawer'),agentToggle=$('agent-toggle');
function setDrawer(open){drawer.hidden=!open;agentToggle.setAttribute('aria-expanded',String(open));if(open)$('agent-close').focus();else agentToggle.focus();}
agentToggle.addEventListener('click',()=>setDrawer(drawer.hidden));$('agent-close').addEventListener('click',()=>setDrawer(false));
window.addEventListener('companion:open-agent',()=>setDrawer(true));
window.addEventListener('pagehide',()=>{stopCosmos();for(const observer of healthObservers)observer.disconnect();document.removeEventListener('visibilitychange',setVisibilityMode);},{once:true});
try {
const account=await identity();
if(account.authenticated){
const project=await request('/api/project');
const byId=new Map((project.resolvedObjects||project.graph.objects).map(o=>[o.objectId,o]));
const fixtureIdentity=account.legacy?project.actor:await request('/api/fixture/session',{});
const views=createViewStack(),session=createFixtureSession(fixtureIdentity.sessionId);
let graphViewport,graphWorld,graphAnimation=0,playHandle=0,timelineToken=0,artifact=null,pinned=null,currentFrame=0,graphReady=false,graphResize,graphLifetime,latestMeasurement=null,resumeGraph,cameraAutoFit=true;
const states=new Map();
$('summary').textContent=`${project.topology.pages.length} PORTALS / ${project.topology.bindings.length} WORLDLINES`;
$('analysis').textContent=JSON.stringify(await request('/api/analyze'),null,2);
function stopPlayback(){cancelAnimationFrame(playHandle);playHandle=0;}
function viewport(){return {...views.state.viewport,scrollX:0,scrollY:0};}
function applyViewport(v){if(!graphWorld)return;graphWorld.style.transform=`translate(${v.panX}px,${v.panY}px) scale(${v.zoom})`;$('viewport-state').textContent=`${Math.round(v.zoom*100)}% / OBSERVATORY`;}
function changeViewport(change,userGesture=true){if(views.state.kind!=='macro')return;if(userGesture)cameraAutoFit=false;const v={...viewport(),...change};views.setViewport(v);applyViewport(v);}
function fit(){if(!graphViewport||views.state.kind!=='macro')return;cameraAutoFit=true;const {width,height}=graphViewport.getBoundingClientRect(),zoom=Math.max(.25,Math.min(1.1,width/1380,height/800));changeViewport({zoom,panX:(width-1300*zoom)/2,panY:(height-760*zoom)/2},false);}
let explainSequence=0;
async function explain(id){const seq=++explainSequence;try{const result=await request('/api/explain?id='+encodeURIComponent(id));if(seq!==explainSequence)return;const host=$('explanation');host.replaceChildren(node('h3',result.object.fields?.title||result.object.type),node('p',result.explanation));const details=node('details');details.append(node('summary','对象坐标与契约'),node('pre',JSON.stringify(result.object,null,2)));host.append(details);}catch(error){$('explanation').textContent='无法读取对象说明：'+error.message;}}
function open(kind,id){const object=byId.get(id);if(!object)return;stopPlayback();timelineToken++;cancelAnimationFrame(graphAnimation);attractor=null;if(views.state.kind==='macro'){if(rhineMode)rhineScene?.setStageActive(true);else views.setViewport(viewport());const portal=(rhineMode?rhineRoot:graphWorld)?.querySelector(`[data-node-id="${CSS.escape(id)}"]`);if(kind==='page'&&portal){const aperture=rhineMode?portal:graphWorld.querySelector(`.portal-miniature[data-page="${CSS.escape(id)}"]`)||portal;const rect=aperture.getBoundingClientRect();$('page-stage').style.transformOrigin=`${rect.x+rect.width/2-window.innerWidth*.05}px ${rect.y+rect.height/2-window.innerHeight*.08}px`;}}views.open(kind,id);window.dispatchEvent(new CustomEvent('companion:object',{detail:{objectId:id,label:object.fields.title||(object.type==='TransitionBinding'?'世界线 / '+object.fields.trigger:object.type)}}));void explain(id);render();}
function renderMacro(){
 if(rhineMode){rhineRoot=node('main',undefined,'rhine-study');document.body.append(rhineRoot);rhineScene=renderRhineStudy(rhineRoot,project.topology,account,{openPage:id=>open('page',id),openTransition:id=>open('transition',id)});graphReady=true;return;}
 const workspace=$('macro-scene');graphViewport=node('div',undefined,'graph-viewport');graphViewport.tabIndex=0;graphViewport.setAttribute('aria-label','世界线星图。拖拽平移，滚轮缩放；加减键缩放，方向键平移，Home适配全图。');graphWorld=node('div',undefined,'graph-world');graphViewport.append(graphWorld);workspace.append(graphViewport);
 const sky=renderAstrolabe(graphWorld,project.topology,byId,open);
 const intro=node('div',undefined,'sky-intro'),headline=node('h1');headline.append(node('span','每一个入口，'),node('span','都是一条世界线。'));intro.append(node('span','MULTIVERSE / 03 WORLDS','eyebrow'),headline,node('p','观测页面结构，或沿轨道进入转场切片。'));workspace.append(intro);
 for(const portal of sky.svg.querySelectorAll('.portal')){portal.addEventListener('pointerenter',()=>{const aperture=graphWorld.querySelector(`.portal-miniature[data-page="${CSS.escape(portal.dataset.nodeId)}"]`)||portal;const rect=aperture.getBoundingClientRect();attractor={x:rect.x+rect.width/2,y:rect.y+rect.height/2};});portal.addEventListener('pointerleave',()=>{attractor=null;});}
 let drag=null;
 graphViewport.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('[role=button],button,summary'))return;drag={x:event.clientX,y:event.clientY,v:viewport()};graphViewport.setPointerCapture(event.pointerId);});
 graphViewport.addEventListener('pointermove',event=>{if(drag)changeViewport({panX:drag.v.panX+event.clientX-drag.x,panY:drag.v.panY+event.clientY-drag.y});});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])graphViewport.addEventListener(name,()=>{drag=null;});
 graphViewport.addEventListener('wheel',event=>{event.preventDefault();const rect=graphViewport.getBoundingClientRect(),v=viewport(),zoom=Math.max(.25,Math.min(2,v.zoom*Math.exp(-event.deltaY*.001)));const x=event.clientX-rect.left,y=event.clientY-rect.top;changeViewport({zoom,panX:x-(x-v.panX)*zoom/v.zoom,panY:y-(y-v.panY)*zoom/v.zoom});},{passive:false});
 graphViewport.addEventListener('keydown',event=>{if(event.target!==graphViewport)return;const v=viewport(),delta={ArrowLeft:[32,0],ArrowRight:[-32,0],ArrowUp:[0,32],ArrowDown:[0,-32]}[event.key];if(delta){event.preventDefault();changeViewport({panX:v.panX+delta[0],panY:v.panY+delta[1]});}else if(['+','=','-','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')fit();else changeViewport({zoom:Math.max(.25,Math.min(2,v.zoom*(event.key==='-'?.9:1.1)))});}});
 const details=node('details',undefined,'technical-map');details.append(node('summary','技术拓扑 / Mermaid'));const renderer=node('div');details.append(renderer);let loaded=false;details.addEventListener('toggle',async()=>{if(!details.open||loaded)return;loaded=true;try{const {default:mermaid}=await import('/vendor/mermaid.js');await renderTopology(renderer,project.topology,mermaid,open);}catch(error){renderer.textContent='技术拓扑加载失败：'+error.message;loaded=false;}});workspace.append(details);
 if(!graphReady){fit();graphReady=true;}else applyViewport(views.state.viewport);
 const selected=views.state.viewport.selection;if(selected)sky.svg.querySelector(`[data-node-id="${CSS.escape(selected)}"]`)?.focus({preventScroll:true});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');graphLifetime=new AbortController();
 function tick(now){graphAnimation=0;if(views.state.kind!=='macro'||document.hidden||reduced.matches||staticObservation)return;for(const photon of sky.photons){const p=cubicPoint(photon.points,(now/10000+photon.phase)%1);photon.element.setAttribute('cx',p.x);photon.element.setAttribute('cy',p.y);}graphAnimation=requestAnimationFrame(tick);}
 function resume(){cancelAnimationFrame(graphAnimation);graphAnimation=0;if(!reduced.matches&&!staticObservation&&!document.hidden&&views.state.kind==='macro')graphAnimation=requestAnimationFrame(tick);}
 resumeGraph=resume;document.addEventListener('visibilitychange',resume,{signal:graphLifetime.signal});reduced.addEventListener('change',resume,{signal:graphLifetime.signal});window.addEventListener('companion:motion',resume,{signal:graphLifetime.signal});resume();
 graphResize=new ResizeObserver(()=>{if(views.state.kind==='macro'){if(cameraAutoFit)fit();else applyViewport(views.state.viewport);}});graphResize.observe(graphViewport);
}
function renderPage(id){
 const page=byId.get(id);$('page-title').textContent=page.fields.title;
 const host=$('xray-panel');host.replaceChildren();const tree=node('ul',undefined,'xray-tree');
 function branch(objectId,path=new Set()){const object=byId.get(objectId);if(!object)return node('li','未解析对象');const li=node('li'),button=node('button',object.fields.title||object.fields.role||object.fields.tag||object.type);button.title=object.objectId;button.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('companion:object',{detail:{objectId}}));void explain(objectId);setDrawer(true);});li.append(button);if(!path.has(objectId)){const list=node('ul',undefined,'xray-tree');for(const child of object.children||[])list.append(branch(child,new Set([...path,objectId])));if(list.childNodes.length)li.append(list);}return li;}
 tree.append(branch(id));host.append(tree);const svg=svgNode(document,'svg',{class:'xray-drawing',viewBox:'0 0 600 440','aria-label':'根据对象树生成的结构透视图'});wireframeRows(page,byId).forEach((row,index)=>{const x=40+row.depth*24,y=24+index*56;svg.append(svgNode(document,'rect',{x,y,width:520-row.depth*24,height:44,fill:'none',stroke:'#EAE6DF','stroke-opacity':'.65'}),svgNode(document,'text',{x:x+12,y:y+28,fill:'#EAE6DF','font-size':12},(row.label||row.tag)));});host.append(svg);
 const route=page.fields.route;navigatePreview(route);
 updateMeasuredXray();setMode('live');$('mode-live').focus({preventScroll:true});window.dispatchEvent(new CustomEvent('companion:page-open',{detail:{objectId:id}}));
}
function updateMeasuredXray(){
 if(views.state.kind!=='page'||latestMeasurement?.pathname!==byId.get(views.state.objectId)?.fields.route)return;
 const svg=$('xray-panel').querySelector('svg');if(!svg)return;
 const width=$('preview').clientWidth||960,height=$('preview').clientHeight||540;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label','PreviewBridge 实测容器边界，左侧为可选对象树');svg.replaceChildren();
 for(const [index,rect]of latestMeasurement.rects.entries()){svg.append(svgNode(document,'rect',{x:rect.x,y:rect.y,width:rect.width,height:rect.height,fill:'none',stroke:index?'#EAE6DF':'#D4AF37','stroke-opacity':'.65','stroke-width':1}),svgNode(document,'text',{x:rect.x+8,y:rect.y+18,fill:'#EAE6DF','font-size':12},`MEASURED / ${index+1}`));}
}
const PAGE_MODES=['live','xray','spec'];
function setMode(mode){for(const name of PAGE_MODES){const panel=$(name+'-panel');if(name==='live'){panel.hidden=false;panel.classList.toggle('occluded',mode!=='live');panel.setAttribute('aria-hidden',String(mode!=='live'));}else panel.hidden=name!==mode;$('mode-'+name).setAttribute('aria-selected',String(name===mode));$('mode-'+name).tabIndex=name===mode?0:-1;}if(mode==='spec')window.dispatchEvent(new CustomEvent('companion:spec-open'));}
for(const [index,mode]of PAGE_MODES.entries()){
 const tab=$('mode-'+mode);tab.addEventListener('click',()=>setMode(mode));tab.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?PAGE_MODES.length-1:(index+(event.key==='ArrowRight'?1:-1)+PAGE_MODES.length)%PAGE_MODES.length;
  setMode(PAGE_MODES[next]);$('mode-'+PAGE_MODES[next]).focus();
 });
}
function fixtureScene(host,frame){
 host.replaceChildren();const state=frame.state;
 for(const target of [false,true]){
  const scene=node('div',undefined,'page-scene'+(target?' target':''));scene.style.visibility=(target?state.targetVisible:state.sourceVisible)?'visible':'hidden';
  const object=byId.get(target?state.targetPage:state.sourcePage),rows=object?wireframeRows(object,byId):[];
  const rail=node('div',undefined,'scene-column');rail.append(node('small',target?'TO / TARGET':'FROM / SOURCE'),node('strong',object?.fields.title||'PAGE'));
  const body=node('div',undefined,'scene-column');body.style.transform=`translateY(${state.itemY}px)`;body.style.opacity=String(state.itemOpacity);body.append(node('small','STRUCTURAL SECTION'));
  for(const row of rows){const label=node('p',(row.label||row.tag));label.style.marginLeft=Math.min(24,row.depth*4)+'px';body.append(label,node('div',undefined,'scene-line'));}
  const detail=node('div',undefined,'scene-column');detail.append(node('small',state.scene==='createDecodeDriver'?'CHARACTER DECODE':'PAGE BLUEPRINT'),node('strong',state.scene==='createDecodeDriver'?state.decode:(target?'ARRIVAL':'DEPARTURE')));
  const geometry=svgNode(document,'svg',{viewBox:'0 0 220 240',width:'100%',height:'70%','aria-hidden':'true'});geometry.append(svgNode(document,'circle',{cx:110,cy:110,r:82,fill:'none',stroke:'#EAE6DF','stroke-opacity':'.65'}),svgNode(document,'path',{d:'M 0 110 H 220 M 110 0 V 240 M 30 190 L 190 30',stroke:'#D4AF37','stroke-opacity':'.65'}));detail.append(geometry);scene.append(rail,body,detail);host.append(scene);
 }
 const sheet=node('div',undefined,'sheet');sheet.style.clipPath=`polygon(${state.clipLeft}% 0%,${state.clipRight}% 0%,${state.clipBottomRight}% 100%,${state.clipBottomLeft}% 100%)`;sheet.style.visibility=state.overlay>0?'visible':'hidden';sheet.style.transform=`translateX(${state.stripX}%)`;
 const geometry=node('div',undefined,'poster-geometries');geometry.style.transform=`rotate(${-24+state.poster*30}deg)`;sheet.append(geometry,node('span','IVORG / 0'+(state.poster+1),'poster-word'));host.append(sheet,node('div',`${frame.timeMs.toFixed(1)} ms / ${state.scene}`,'fixture-caption'));
}
async function renderTransition(id){
 const token=++timelineToken,binding=byId.get(id),definition=byId.get(binding.fields.definitionRef),workspace=$('detail-scene'),saved=states.get(id);artifact=null;pinned=null;currentFrame=0;
 const slicer=node('section',undefined,'slicer'),heading=node('div',undefined,'slicer-heading'),titles=node('div');
 titles.append(node('span','WORLDLINE SLICER / FIXTURE OBSERVATION','eyebrow'),node('h1',`${byId.get(binding.fields.fromPage)?.fields.title||'FROM'} → ${byId.get(binding.fields.toPage)?.fields.title||'TO'}`));heading.append(titles);
 const metadata=node('details',undefined,'timeline-data');metadata.append(node('summary','观测数据 / 参数与校验'));const hashes=node('pre');metadata.append(hashes);heading.append(metadata);slicer.append(heading);
 const stages=node('div',undefined,'stages'),current=node('div',undefined,'fixture'),comparison=node('div',undefined,'fixture'),a=node('section'),b=node('section');
 a.append(node('h2','CURRENT WORLDLINE / 当前切面'),current);b.append(node('h2','REFERENCE / 固定帧或实时数值比较'),comparison);b.hidden=true;stages.append(a,b);slicer.append(stages);
 const scrubber=node('div',undefined,'scrubber'),slider=node('input'),info=node('output');slider.type='range';slider.min='0';slider.value='0';slider.disabled=true;slider.setAttribute('aria-label','转场时间轴帧号');scrubber.append(slider,info);slicer.append(scrubber);
 const controls=node('div',undefined,'controls'),play=node('button','▶ 播放','primary'),reverse=node('button','↶ 倒放'),prev=node('button','−1 帧'),next=node('button','+1 帧'),reroll=node('button','↻ Reroll'),pin=node('button','固定帧比较'),live=node('button','实时对齐'),closeComparison=node('button','关闭比较');closeComparison.hidden=true;
 const speed=node('select');speed.setAttribute('aria-label','播放倍率');for(const value of [.25,.5,1,2]){const option=node('option',value+'×');option.value=String(value);if(value===1)option.selected=true;speed.append(option);}
 const seed=node('input');seed.type='number';seed.min='0';seed.max='4294967295';seed.value=String(saved?.seed??1);seed.setAttribute('aria-label','Fixture seed');
 const bakeButton=node('button','同 Seed 重烘焙');metadata.append(node('label','Seed'),seed,bakeButton);controls.append(play,reverse,prev,next,reroll,pin,live,closeComparison,speed);slicer.append(controls,node('p','拖动读取已烘焙帧；Reroll 明确改变 Seed。当前舞台不切换真实网页。'));workspace.append(slicer);
 let playing=false;
 function draw(index){
  if(token!==timelineToken||!artifact)return;currentFrame=Math.max(0,Math.min(artifact.frames.length-1,Math.round(index)));const frame=session.seekFrame(currentFrame);slider.value=String(currentFrame);fixtureScene(current,frame);if(pinned)fixtureScene(comparison,pinned);
  slider.style.setProperty('--seek',`${currentFrame/Math.max(1,artifact.frames.length-1)*100}%`);
  info.textContent=`${currentFrame} / ${artifact.frames.length-1} · ${frame.timeMs.toFixed(0)}ms`;hashes.textContent=`${id}\n${definition.objectId}\n${artifact.instance.instanceId}\nSeed ${artifact.seed} / deck ${session.deckCursor}\nbakeKey ${artifact.bakeKey}\nchecksum ${artifact.checksum}\n环境 ${JSON.stringify(artifact.environment)}\n参数 ${JSON.stringify(artifact.params)}`;
  states.set(id,{seed:artifact.seed,frame:currentFrame});
 }
 const halt=()=>{stopPlayback();playing=false;play.textContent='▶ 播放';};
 async function bake(newSeed){halt();slider.disabled=true;for(const button of [bakeButton,reroll,play,reverse,prev,next,pin,live])button.disabled=true;try{const result=await session.bake({binding,definition,seed:newSeed,fixtureRevision:project.fixtureRevision,environment:{browserBuild:navigator.userAgent,fontHash:await digest([...document.fonts].map(font=>({family:font.family,status:font.status})))},viewport:{w:960,h:540,frameZoom:1,dpr:devicePixelRatio},specHash:project.graph.specHash,sourceRevision:project.sourceRevision,targetRevision:project.sourceRevision,posterCount:4});if(token!==timelineToken)return;artifact=result;seed.value=String(result.seed);slider.max=String(result.frames.length-1);pinned=result.frames[0];draw(0);}catch(error){info.textContent=error.message;}finally{slider.disabled=!artifact;for(const button of [bakeButton,reroll,play,reverse,prev,next,pin,live])button.disabled=!artifact;}}
 function start(direction){if(playing){halt();return;}if(!artifact)return;if(direction>0&&currentFrame===artifact.frames.length-1)draw(0);if(direction<0&&currentFrame===0)draw(artifact.frames.length-1);let last=performance.now(),fraction=currentFrame;playing=true;play.textContent='Ⅱ 暂停';function tick(now){if(token!==timelineToken)return;fraction+=(now-last)*artifact.fps/1000*Number(speed.value)*direction;last=now;draw(fraction);if(fraction<=0||fraction>=artifact.frames.length-1){halt();return;}playHandle=requestAnimationFrame(tick);}playHandle=requestAnimationFrame(tick);}
 play.addEventListener('click',()=>start(1));reverse.addEventListener('click',()=>start(-1));prev.addEventListener('click',()=>{halt();draw(currentFrame-1);});next.addEventListener('click',()=>{halt();draw(currentFrame+1);});slider.addEventListener('input',()=>{halt();draw(Number(slider.value));});
 bakeButton.addEventListener('click',()=>void bake(Number(seed.value)));reroll.addEventListener('click',()=>void bake((Number(seed.value)+1)>>>0));
 pin.addEventListener('click',()=>{if(!artifact)return;b.hidden=false;closeComparison.hidden=false;pinned=session.seekFrame(currentFrame);draw(currentFrame);});closeComparison.addEventListener('click',()=>{b.hidden=true;closeComparison.hidden=true;});
 live.addEventListener('click',()=>{if(!artifact)return;halt();b.hidden=false;closeComparison.hidden=false;const alignment=[0,.25,.5,.75,1].map(ratio=>{const index=Math.round((artifact.frames.length-1)*ratio),frame=artifact.frames[index];return {ratio,...compareNormalized(frame.state,session.sampleLive(frame.timeMs).state,{frameIndex:index,environment:artifact.environment})};});const started=performance.now();function tick(now){if(token!==timelineToken)return;const ms=Math.min(artifact.durationMs,(now-started)*Number(speed.value));draw(Math.round(ms*artifact.fps/1000));fixtureScene(comparison,session.sampleLive(ms));if(ms<artifact.durationMs)playHandle=requestAnimationFrame(tick);else{halt();hashes.textContent+='\n实时对齐 '+JSON.stringify(alignment);}}playHandle=requestAnimationFrame(tick);});
 await bake(Number(seed.value));if(token===timelineToken&&artifact){slider.disabled=false;if(saved?.frame)draw(saved.frame);slider.focus({preventScroll:true});}
}

function render(){
 $('macro-scene').toggleAttribute('inert',views.state.kind!=='macro');$('macro-scene').setAttribute('aria-hidden',String(views.state.kind!=='macro'));
 $('interaction-hint').textContent=views.state.kind==='macro'?'拖拽平移 · 滚轮缩放 · 点击星盘进入':views.state.kind==='page'?'在网页内按 Alt+S 框选 · 返回按钮回到星图':'拖动时间轴 · Reroll 改变 Seed · 返回星图';
 cancelAnimationFrame(graphAnimation);$('initial-loading').hidden=true;$('macro-scene').hidden=views.state.kind==='transition';$('detail-scene').hidden=views.state.kind!=='transition';$('detail-scene').replaceChildren();$('back').hidden=views.state.kind==='macro';$('reset').hidden=views.state.kind!=='macro';$('page-stage').hidden=views.state.kind!=='page';document.body.dataset.view=views.state.kind;
 if(rhineMode){$('toolbar').hidden=views.state.kind==='macro';$('reset').hidden=true;rhineScene?.setStageActive(views.state.kind!=='macro');}
 if(views.state.kind==='macro'){if(!graphReady)renderMacro();else if(rhineMode){rhineScene.setStageActive(false);const selected=views.state.viewport.selection;if(selected){const call=rhineRoot.querySelector(`[data-call-binding-id="${CSS.escape(selected)}"]`),target=call&&!call.closest('[hidden]')?call:rhineRoot.querySelector(`[data-node-id="${CSS.escape(selected)}"]`);target?.focus({preventScroll:true});}}else{applyViewport(views.state.viewport);resumeGraph?.();const selected=views.state.viewport.selection;if(selected)graphWorld.querySelector(`[data-node-id="${CSS.escape(selected)}"]`)?.focus({preventScroll:true});}}else if(views.state.kind==='page')renderPage(views.state.objectId);else void renderTransition(views.state.objectId);
}
function back(){if(views.state.kind==='macro')return;stopPlayback();timelineToken++;views.back();render();}
$('back').addEventListener('click',back);$('reset').addEventListener('click',fit);
window.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!drawer.hidden)setDrawer(false);else if(!document.querySelector('.account-panel[open]'))back();}});
let preview=$('preview'),bridge,previewPathname=null;
function bindPreview(){
 bridge?.dispose();previewPathname=null;const source=preview.contentWindow,boundFrame=preview;
 const session=createBridgeSession({source,send(message){source.postMessage(message,PREVIEW_ORIGIN);},onState(state){$('bridge').textContent=state==='CONNECTED'?'PREVIEW CONNECTED':state;},onMessage(result){
 if(result.kind==='measure'&&result.hitIds.some(id=>!byId.has(id)))return;
 if(result.pathname)previewPathname=result.pathname;
 if(result.kind==='measure'){latestMeasurement=result;updateMeasuredXray();}
 if(result.kind==='measure'&&result.selection){if(views.state.kind!=='page'||result.pathname!==byId.get(views.state.objectId)?.fields.route)return;window.dispatchEvent(new CustomEvent('companion:selection',{detail:{...result.selection,capture:result.capture,receivedAt:Date.now()}}));$('bridge').textContent='空间选区已捕获';}
 else $('bridge').textContent=result.kind==='error'?'预览需要重连 / '+result.code:'PREVIEW / '+(result.pathname||result.kind);
 }});bridge=session;
 boundFrame.addEventListener('load',()=>{if(preview===boundFrame)session.connect();});session.connect();
}
function navigatePreview(route){
 if(previewPathname===route||previewPathname===null&&new URL(preview.src).pathname===route)return;
 const next=preview.cloneNode(false);next.src=PREVIEW_ORIGIN+route;
 bridge?.dispose();preview.replaceWith(next);preview=next;latestMeasurement=null;bindPreview();
}
window.addEventListener('message',event=>bridge.receive(event));
window.addEventListener('companion:request-measure',event=>{void bridge.remeasure().then(event.detail.resolve,event.detail.reject);});
$('reconnect').addEventListener('click',()=>bridge.connect());bindPreview();render();
window.addEventListener('pagehide',()=>{stopPlayback();cancelAnimationFrame(graphAnimation);graphLifetime?.abort();graphResize?.disconnect();rhineScene?.dispose();bridge.dispose();});
}
}catch(error){$('summary').textContent='连接失败';let host=$('workspace');if(rhineMode){host=rhineRoot||node('main',undefined,'rhine-study');if(!host.isConnected)document.body.append(host);rhineScene?.dispose();}host.replaceChildren(node('h1','观测仪暂时无法连接'),node('p',error.message));const retry=node('button','重新连接','primary');retry.addEventListener('click',()=>location.reload());host.append(retry);}
