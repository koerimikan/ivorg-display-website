import { PREVIEW_ORIGIN, acceptBridgeMessage } from '/src/workbench-core/bridge.js';
import { createFixtureSession } from '/src/workbench-core/motion/fixture.js';
import { createViewStack } from '/src/workbench-core/view-stack.js';
import {createBridgeSession} from '/src/workbench-core/bridge-session.js';

import {identity,request} from '/client.js';
const account=await identity();
if(account.authenticated){
const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const el=document.createElement(tag); if(text!==undefined)el.textContent=text; if(className)el.className=className; return el; };
const project = await fetch('/api/project').then(r=>{if(!r.ok)throw new Error('Project load failed');return r.json();});
const byId = new Map((project.resolvedObjects||project.graph.objects).map(o=>[o.objectId,o]));
const fixtureIdentity=account.legacy?project.actor:await request('/api/fixture/session',{});
const views = createViewStack(), session = createFixtureSession(fixtureIdentity.sessionId);
let graphViewport, graphWorld, playHandle=0, timelineToken=0, artifact=null, pinned=null, currentFrame=0;
const states = new Map();
$('summary').textContent=`${project.topology.pages.length} PAGES / ${project.topology.adjacencies.length} ADJACENCIES / ${project.topology.bindings.length} ENABLED BINDINGS`;
$('analysis').textContent=JSON.stringify(await fetch('/api/analyze').then(r=>r.json()),null,2);

function stopPlayback(){cancelAnimationFrame(playHandle);playHandle=0;}
function viewport(){return {...views.state.viewport,scrollX:graphViewport?.scrollLeft||0,scrollY:graphViewport?.scrollTop||0};}
function applyViewport(v){
  if(!graphWorld)return;
  graphWorld.style.transform=`translate(${v.panX}px,${v.panY}px) scale(${v.zoom})`;
  $('zoom').value=String(v.zoom*100);$('zoom-value').textContent=`${Math.round(v.zoom*100)}%`;
  $('viewport-state').textContent=`pan ${v.panX}, ${v.panY} · zoom ${v.zoom.toFixed(2)}`;
}
function changeViewport(change){if(views.state.kind!=='macro')return;const v={...viewport(),...change};views.setViewport(v);applyViewport(v);if('scrollX' in change)graphViewport.scrollLeft=v.scrollX;if('scrollY' in change)graphViewport.scrollTop=v.scrollY;}
async function explain(id){const r=await fetch(`/api/explain?id=${encodeURIComponent(id)}`);if(r.ok)$('explanation').textContent=JSON.stringify(await r.json(),null,2);}
function open(kind,id){
  stopPlayback();timelineToken++;
  if(views.state.kind==='macro')views.setViewport(viewport());
  views.open(kind,id);window.dispatchEvent(new CustomEvent('companion:object',{detail:{objectId:id}}));void explain(id);render();
}
function renderMacro(){
  const workspace=$('workspace');workspace.append(node('h1','宏观对象拓扑 / Storyboard'));
  workspace.append(node('p',`中间按钮是独立 TransitionBinding 对象。td.wipeCover 被 ${project.topology.definitionReuse['td.wipeCover'].length} 条绑定复用；页面内 HOME → DISCO 有 ${project.topology.homeDiscoEntrances.length} 条入口。背景可拖动平移，亦可用工具栏。`));
  graphViewport=node('div',undefined,'graph-viewport');graphViewport.tabIndex=0;graphViewport.setAttribute('aria-label','宏观图视口');
  graphWorld=node('div',undefined,'graph-world');graphViewport.append(graphWorld);workspace.append(graphViewport);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','graph-lines');svg.setAttribute('aria-hidden','true');graphWorld.append(svg);
  const positions=new Map();
  project.topology.pages.forEach((page,i)=>positions.set(page.objectId,{x:40+i*360,y:20,w:290,h:155}));
  project.topology.bindings.forEach((binding,i)=>positions.set(binding.objectId,{x:40+(i%3)*360,y:235+Math.floor(i/3)*175,w:290,h:115}));
  for(const edge of project.topology.edges){
    const a=positions.get(edge.from),b=positions.get(edge.to),p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',`M ${a.x+a.w/2} ${a.y+a.h/2} C ${a.x+a.w/2} ${b.y}, ${b.x+b.w/2} ${a.y+a.h}, ${b.x+b.w/2} ${b.y+b.h/2}`);
    p.setAttribute('fill','none');p.setAttribute('stroke','#7da8bc');p.setAttribute('stroke-opacity','.32');p.setAttribute('stroke-width','1.5');svg.append(p);
  }
  for(const item of project.topology.nodes){
    const pos=positions.get(item.id),button=node('button',undefined,`node ${item.kind}${views.state.viewport.selection===item.id?' selected':''}`);
    button.dataset.nodeId=item.id;button.style.left=`${pos.x}px`;button.style.top=`${pos.y}px`;
    button.append(node('strong',item.kind==='page'?item.object.fields.title:'TransitionBinding'),node('div',item.id,'node-id'));
    if(item.kind==='page'){
      const wire=node('div',undefined,'wireframe');for(let i=0;i<3;i++)wire.append(node('i'));button.append(wire,node('small',item.object.fields.route));
    }else button.append(node('small',`${item.object.fields.fromPage} → ${item.object.fields.toPage}`),node('small',`${item.object.fields.definitionRef} / ${item.object.fields.trigger}`));
    button.addEventListener('click',()=>open(item.kind==='page'?'page':'transition',item.id));graphWorld.append(button);
  }
  let drag;
  graphViewport.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,v:viewport()};graphViewport.setPointerCapture(e.pointerId);});
  graphViewport.addEventListener('pointermove',e=>{if(drag)changeViewport({panX:drag.v.panX+e.clientX-drag.x,panY:drag.v.panY+e.clientY-drag.y});});
  graphViewport.addEventListener('pointerup',()=>{drag=null;});graphViewport.addEventListener('pointercancel',()=>{drag=null;});
  const details=node('details');details.append(node('summary','只读 Mermaid 投影（可复制；交互由上述 SVG 对象图提供）'));
  const safeIds=new Map(project.topology.nodes.map((n,i)=>[n.id,`n${i}`]));
  const lines=['flowchart TB',...project.topology.nodes.map(n=>`  ${safeIds.get(n.id)}["${n.id}"]`),...project.topology.edges.map(e=>`  ${safeIds.get(e.from)} --> ${safeIds.get(e.to)}`)];
  details.append(node('pre',lines.join('\n')));workspace.append(details);
  const v=views.state.viewport;applyViewport(v);graphViewport.scrollLeft=v.scrollX;graphViewport.scrollTop=v.scrollY;
  if(v.selection)graphWorld.querySelector(`[data-node-id="${CSS.escape(v.selection)}"]`)?.focus({preventScroll:true});
}
function renderPage(id){
  const page=byId.get(id),workspace=$('workspace');workspace.append(node('h1',page.fields.title),node('p',page.description));
  function tree(objectId,path=new Set()){
    const o=byId.get(objectId),li=node('li'),button=node('button',`${o.type} / ${o.objectId}`);button.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('companion:object',{detail:{objectId}}));void explain(objectId);});li.append(button);if(path.has(objectId))return li;
    const ul=node('ul',undefined,'tree'),next=new Set([...path,objectId]);for(const child of o.children)ul.append(tree(child,next));if(o.children.length)li.append(ul);return li;
  }
  const ul=node('ul',undefined,'tree');ul.append(tree(id));workspace.append(ul);
  const route=page.fields.route;if(new URL($('preview').src).pathname!==route)$('preview').src=PREVIEW_ORIGIN+route;
}
function fixtureScene(host,frame){
  host.replaceChildren();const s=frame.state;
  for(const target of [false,true]){
    const page=node('div',undefined,`page-scene${target?' target':''}`);page.style.visibility=(target?s.targetVisible:s.sourceVisible)?'visible':'hidden';
    for(const label of ['RAIL',target?s.targetPage:s.sourcePage,s.decode]){const box=node('div',label);box.style.transform=`translateY(${s.itemY}px)`;box.style.opacity=String(s.itemOpacity);page.append(box);}host.append(page);
  }
  const sheet=node('div',`POSTER ${s.poster+1}`, 'sheet');sheet.style.clipPath=`polygon(0% 0%,${s.clipRight}% 0%,${Math.max(0,s.clipRight-18)}% 100%,0% 100%)`;
  sheet.style.visibility=s.overlay>0?'visible':'hidden';sheet.style.backgroundColor=['#2444b5','#008878','#b83060','#1090d8'][s.poster%4];sheet.style.transform=`translateX(${s.stripX}%)`;host.append(sheet,node('div',`${frame.frameIndex} / ${frame.timeMs.toFixed(2)}ms / ${s.scene}`,'fixture-caption'));
}
async function renderTransition(id){
  const token=++timelineToken,binding=byId.get(id),definition=byId.get(binding.fields.definitionRef),workspace=$('workspace'),saved=states.get(id);
  workspace.append(node('h1',id),node('p',`${binding.fields.fromPage} → ${binding.fields.toPage} / ${definition.objectId}`),node('p','脱敏矢量 Fixture：无外部素材、无真实 navigate、不含视差；固定环境下对规范化帧作 checksum。'));
  const controls=node('div',undefined,'controls'),seed=node('input');seed.type='number';seed.min='0';seed.max='4294967295';seed.value=String(states.get(id)?.seed??1);
  const seedLabel=node('label','Seed');seedLabel.append(seed);controls.append(seedLabel);
  const bakeButton=node('button','Bake / 同 Seed 重烘焙'),reroll=node('button','Reroll / Seed +1'),play=node('button','播放 / 暂停'),reverse=node('button','倒放'),prev=node('button','前一帧'),next=node('button','后一帧'),pin=node('button','固定当前帧对比');
  const speed=node('select');speed.setAttribute('aria-label','播放倍率');for(const v of [.25,.5,1,2]){const option=node('option',`${v}×`);option.value=String(v);option.selected=v===1;speed.append(option);}
  controls.append(bakeButton,reroll,play,reverse,prev,next,pin,speed);workspace.append(controls);
  const slider=node('input');slider.type='range';slider.min='0';slider.value='0';slider.setAttribute('aria-label','Fixture 时间轴帧号');slider.style.width='100%';workspace.append(slider);
  const info=node('output'),hashes=node('pre',undefined,'hash');workspace.append(info,hashes);
  const stages=node('div',undefined,'stages'),current=node('div',undefined,'fixture'),comparison=node('div',undefined,'fixture');
  const a=node('section'),b=node('section');a.append(node('h2','当前帧 / replay only'),current);b.append(node('h2','固定帧对比 / normalized state'),comparison);stages.append(a,b);workspace.append(stages);
  function draw(index){
    if(!artifact)return;currentFrame=Math.max(0,Math.min(artifact.frames.length-1,Math.round(index)));const frame=session.seekFrame(currentFrame);slider.value=String(currentFrame);fixtureScene(current,frame);if(pinned)fixtureScene(comparison,pinned);
    info.textContent=`frame ${currentFrame}/${artifact.frames.length-1} · ${frame.timeMs.toFixed(2)}ms · deckCursor=${session.deckCursor}`;
    hashes.textContent=`${artifact.instance.instanceId}\n${artifact.instance.sessionId} / seq ${artifact.instance.instanceSeq}\nbakeKey ${artifact.bakeKey}\nchecksum ${artifact.checksum}`;
    states.set(id,{seed:artifact.seed,frame:currentFrame});
  }
  async function bake(newSeed){
    stopPlayback();bakeButton.disabled=true;reroll.disabled=true;
    try{
      const result=await session.bake({binding,definition,seed:newSeed,specHash:project.graph.specHash,sourceRevision:project.sourceRevision,targetRevision:project.sourceRevision,posterCount:4});
      if(token!==timelineToken)return;artifact=result;seed.value=String(result.seed);slider.max=String(result.frames.length-1);pinned??=result.frames[0];draw(0);
    }catch(error){info.textContent=error.message;}
    finally{bakeButton.disabled=false;reroll.disabled=false;}
  }
  function start(direction){
    if(playHandle){stopPlayback();return;}if(!artifact)return;let last=performance.now(),fraction=currentFrame;
    function tick(now){if(token!==timelineToken)return;fraction+=(now-last)*60/1000*Number(speed.value)*direction;last=now;draw(fraction);if(fraction<=0||fraction>=artifact.frames.length-1){stopPlayback();return;}playHandle=requestAnimationFrame(tick);}playHandle=requestAnimationFrame(tick);
  }
  bakeButton.addEventListener('click',()=>{void bake(Number(seed.value));});reroll.addEventListener('click',()=>{void bake((Number(seed.value)+1)>>>0);});
  play.addEventListener('click',()=>start(1));reverse.addEventListener('click',()=>start(-1));prev.addEventListener('click',()=>{stopPlayback();draw(currentFrame-1);});next.addEventListener('click',()=>{stopPlayback();draw(currentFrame+1);});
  slider.addEventListener('input',()=>{stopPlayback();draw(Number(slider.value));});pin.addEventListener('click',()=>{if(artifact){pinned=session.seekFrame(currentFrame);draw(currentFrame);}});
  await bake(Number(seed.value));if(token===timelineToken&&saved?.frame)draw(saved.frame);
}
function render(){
  graphWorld=null;graphViewport=null;$('workspace').replaceChildren();$('back').hidden=views.state.kind==='macro';
  for(const control of $('toolbar').querySelectorAll('input,button:not(#back)'))control.disabled=views.state.kind!=='macro';
  if(views.state.kind==='macro')renderMacro();else if(views.state.kind==='page')renderPage(views.state.objectId);else void renderTransition(views.state.objectId);
}
$('back').addEventListener('click',()=>{stopPlayback();timelineToken++;views.back();render();});
$('zoom').addEventListener('input',e=>changeViewport({zoom:Number(e.target.value)/100}));
for(const [id,dx,dy] of [['pan-left',-40,0],['pan-right',40,0],['pan-up',0,-40],['pan-down',0,40]])$(id).addEventListener('click',()=>changeViewport({panX:viewport().panX+dx,panY:viewport().panY+dy}));
$('reset').addEventListener('click',()=>changeViewport({zoom:1,panX:0,panY:0,scrollX:0,scrollY:0}));

const preview=$('preview');
const source=preview.contentWindow;
const bridge=createBridgeSession({source,send(message){source.postMessage(message,PREVIEW_ORIGIN);},onState(state){$('bridge').textContent=state;},onMessage(result){
  if(result.kind==='measure'&&result.hitIds.some(id=>!byId.has(id)))return;
  if(result.kind==='measure'&&result.selection)window.dispatchEvent(new CustomEvent('companion:selection',{detail:{...result.selection,capture:result.capture,receivedAt:Date.now()}}));
  $('bridge').textContent=`${result.kind} / epoch ${result.frameEpoch} / ${result.pathname||result.code||result.breakpointKey||''} / ${result.rects?.length??0} rects · read-only`;
}});
window.addEventListener('message',event=>bridge.receive(event));
window.addEventListener('companion:request-measure',event=>{void bridge.remeasure().then(event.detail.resolve,event.detail.reject);});
preview.addEventListener('load',()=>bridge.connect());$('reconnect').addEventListener('click',()=>bridge.connect());bridge.connect();render();
window.addEventListener('pagehide',()=>{stopPlayback();bridge.dispose();});

}
