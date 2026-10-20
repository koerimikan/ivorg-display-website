// Step-one research implementation. The default workbench renderer remains available.
export function rhineLayout(topology) {
  const ids=['page.home','page.discography','page.newsletter'];
  const panels=ids.map((id,index)=>({id,x:40+index*450,y:110,width:320,height:200,depth:6}));
  if(topology.pages.length!==3||ids.some(id=>!topology.pages.some(page=>page.objectId===id)))throw Error('RHINE_PAGE_CONTRACT');
  const pageMap=new Map(panels.map(panel=>[panel.id,panel]));
  const groups=new Map(),usage=new Map(ids.map(id=>[id,0]));
  const external=topology.bindings.filter(binding=>binding.fields.fromPage!==binding.fields.toPage);
  const counts=new Map(ids.map(id=>[id,external.filter(binding=>[binding.fields.fromPage,binding.fields.toPage].includes(id)).length]));
  const port=id=>{const panel=pageMap.get(id);if(!panel)throw Error('RHINE_ENDPOINT_MISSING');const index=usage.get(id);usage.set(id,index+1);return {x:panel.x+28+(counts.get(id)>1?index*264/(counts.get(id)-1):132),y:panel.y+panel.height};};
  const routes=[];
  for(const binding of topology.bindings){
    const {fromPage,toPage}=binding.fields;
    if(!pageMap.has(fromPage)||!pageMap.has(toPage))throw Error('RHINE_ENDPOINT_MISSING');
    if(fromPage===toPage){const panel=pageMap.get(fromPage),chip={x:panel.x+160,y:62};routes.push({id:binding.objectId,binding,chip,self:true,points:[{x:chip.x,y:110},{x:chip.x,y:62}]});continue;}
    const key=[fromPage,toPage].sort().join('|'),rank=groups.get(key)||0;groups.set(key,rank+1);
    const hd=key==='page.discography|page.home',dn=key==='page.discography|page.newsletter';
    const y=hd?340+rank*40:dn?360+rank*80:400+rank*80;
    const a=port(fromPage),b=port(toPage),direction=Math.sign(b.x-a.x),chip={x:hd?425:dn?875:910,y};
    routes.push({id:binding.objectId,binding,chip,self:false,points:[a,{x:a.x,y:y-12},{x:a.x+12*direction,y},{x:b.x-12*direction,y},{x:b.x,y:y-12},b]});
  }
  if(routes.length!==15||groups.get('page.discography|page.home')!==7||groups.get('page.discography|page.newsletter')!==3||groups.get('page.home|page.newsletter')!==3)throw Error('RHINE_BINDING_CONTRACT');
  return {width:1300,height:650,panels,routes};
}

export function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}

// Cut vertical underpasses at horizontal crossings: crossings never imply junctions.
export function rhineTracePath(route,routes){
 const parts=[];
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i];
  if(a.x!==b.x){parts.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);continue;}
  const cuts=[];
  for(const other of routes){if(other===route)continue;for(let j=1;j<other.points.length;j++){const c=other.points[j-1],d=other.points[j];if(c.y!==d.y||a.x<=Math.min(c.x,d.x)||a.x>=Math.max(c.x,d.x))continue;const t=(c.y-a.y)/(b.y-a.y);if(t>0&&t<1)cuts.push(t);}}
  const length=Math.abs(b.y-a.y),delta=4/length;
  let start=0;for(const t of cuts.sort((x,y)=>x-y)){const end=Math.max(0,t-delta);if(end>start)parts.push(`M ${a.x} ${a.y+(b.y-a.y)*start} L ${b.x} ${a.y+(b.y-a.y)*end}`);start=Math.max(start,Math.min(1,t+delta));}
  if(start<1)parts.push(`M ${a.x} ${a.y+(b.y-a.y)*start} L ${b.x} ${b.y}`);
 }
 return parts.join(' ');
}

export function renderRhineStudy(host,topology,account={}){
 const doc=host.ownerDocument,layout=rhineLayout(topology),make=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 host.dataset.routes='summary';
 const routes={'page.home':'/','page.discography':'/discography/','page.newsletter':'/newsletter/'};
 for(const page of topology.pages)if(routes[page.objectId]!==page.fields.route)throw Error('MINIATURE_ROUTE_NOT_ALLOWED');
 const header=make('header','rl-header'),brand=make('div','rl-brand','IVORG / ARCHIVE LAB');brand.append(make('small','','SPATIAL INTERFACE STUDY · 01'));
 const controls=make('div','rl-controls'),theme=make('button','rl-control','夜间观测'),still=make('button','rl-control','冻结姿态'),reset=make('button','rl-control','适配视口'),accountLabel=make('span','rl-account',`OP // ${String(account.actor?.role||account.role||'LOCAL').toUpperCase()}`);
 const expand=make('button','rl-control','展开15个调用接口');expand.type='button';expand.setAttribute('aria-pressed','false');
 theme.type=still.type=reset.type='button';theme.setAttribute('aria-pressed','false');still.setAttribute('aria-pressed','false');controls.append(expand,theme,still,reset,accountLabel);header.append(brand,controls);
 const intro=make('div','rl-intro');intro.append(make('h1','','空间档案 / 三个真实页面'),make('p','','STEP 01  /  轮廓 · 投影 · 身份命中小样。点击接口查看绑定；此处不切页、不写入。'));
 const viewport=make('section','rl-viewport');viewport.setAttribute('aria-label','三维档案小样画布');viewport.tabIndex=0;viewport.setAttribute('aria-description','空白处拖动平移，滚轮缩放。聚焦画布后用方向键检查有限俯仰与偏航。');
 const camera=make('div','rl-camera'),space=make('div','rl-space'),world=make('div','rl-world'),floor=make('div','rl-floor');
 const svg=svgNode(doc,'svg',{class:'rl-traces',viewBox:'0 0 1300 650','aria-hidden':'true'});
 const paths=new Map();for(const route of layout.routes){const path=svgNode(doc,'path',{d:rhineTracePath(route,layout.routes),'data-route-id':route.id});svg.append(path);paths.set(route.id,path);
  // Non-painting specimen probes let browser evidence measure the shared projection.
  // These are conservative samples of the uncut route, including underpass gaps.
  for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/12);for(let step=0;step<=steps;step++){const t=step/steps;svg.append(svgNode(doc,'circle',{cx:a.x+(b.x-a.x)*t,cy:a.y+(b.y-a.y)*t,r:.01,fill:'transparent','data-line-probe':route.id}));}}
 }
 world.append(floor,svg);
 const panelVertices=[[0,0],[302,0],[320,18],[320,200],[18,200],[0,182]];
 for(const [index,panel]of layout.panels.entries()){
  const page=topology.pages.find(page=>page.objectId===panel.id),object=make('article','rl-panel');object.dataset.pageId=panel.id;object.style.left=panel.x+'px';object.style.top=panel.y+'px';object.style.setProperty('--depth',panel.depth+'px');
  const contact=make('div','rl-ground-shadow');contact.style.left=(panel.x+5)+'px';contact.style.top=(panel.y+10)+'px';world.append(contact);
  const back=make('div','rl-panel-back');object.append(back);
  for(let i=0;i<panelVertices.length;i++){const a=panelVertices[i],b=panelVertices[(i+1)%panelVertices.length],edge=make('i','rl-edge');edge.style.width=Math.hypot(b[0]-a[0],b[1]-a[1])+'px';edge.style.transform=`translate3d(${a[0]}px,${a[1]}px,0) rotateZ(${Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI}deg) rotateX(-90deg)`;object.append(edge);}
  for(const route of layout.routes){for(const end of ['from','to']){
   if(route.binding.fields[end==='from'?'fromPage':'toPage']!==panel.id)continue;
   const point=end==='from'?route.points[0]:route.points.at(-1);if(route.self&&end==='to')continue;
   const probe=make('i','rl-port-probe');probe.dataset.seamEnd=route.id+':'+end;probe.style.left=(point.x-panel.x)+'px';probe.style.top=(point.y-panel.y)+'px';object.append(probe);
   svg.append(svgNode(doc,'circle',{cx:point.x,cy:point.y,r:.01,fill:'transparent','data-seam-wire':route.id+':'+end}));
  }}
  const face=make('div','rl-panel-face'),label=make('div','rl-panel-label');label.append(make('b','',`0${index+1}`),make('span','',panel.id.split('.').at(-1).toUpperCase()),make('small','','LIVE / READ ONLY'));
  const aperture=make('div','rl-aperture');aperture.setAttribute('inert','');aperture.setAttribute('aria-hidden','true');const frame=make('iframe');frame.title=`${page.fields.title} 真实缩略图`;frame.src='http://127.0.0.1:4321'+routes[panel.id];frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('tabindex','-1');aperture.append(frame);
  const select=make('button','rl-page-select');select.type='button';select.setAttribute('aria-label',`查看页面 ${panel.id}`);select.dataset.nodeId=panel.id;
  select.addEventListener('click',()=>{host.dataset.selectedPageId=panel.id;selection.textContent=`PAGE / ${panel.id} — 真实页面缩略图；完整舞台保留在现有工作台。`;});
  face.append(label,aperture,make('span','rl-panel-foot',`IVORG.ARC / ${routes[panel.id]}`));object.append(face,select);world.append(object);
 }
 const chips=new Map();
 function selectBinding(route){
  for(const [id,chip]of chips){chip.setAttribute('aria-pressed',String(id===route.id));paths.get(id).classList.toggle('rl-active',id===route.id);}
  host.dataset.selectedBindingId=route.id;selection.dataset.bindingId=route.id;
  selection.textContent=`${route.id}  /  ${route.binding.fields.fromPage} → ${route.binding.fields.toPage}  /  ${route.binding.fields.trigger}  /  ${route.binding.fields.definitionRef}`;
  selection.setAttribute('data-activation-seq',String(++activationSeq));
 }
 for(const [index,route]of layout.routes.entries()){
  const button=make('button','rl-chip'+(route.self?' rl-chip-init':''));button.type='button';button.style.left=route.chip.x+'px';button.style.top=route.chip.y+'px';button.dataset.bindingId=route.id;button.dataset.nodeId=route.id;button.setAttribute('aria-label',`选择转场 ${route.id}`);button.title=`${route.id}\n${route.binding.fields.fromPage} → ${route.binding.fields.toPage}`;
  button.append(make('span','rl-chip-symbol'),make('span','rl-chip-index',String(index+1).padStart(2,'0')));
  button.addEventListener('click',()=>selectBinding(route));button.setAttribute('aria-pressed','false');chips.set(route.id,button);world.append(button);
 }
 const inspector=make('section','rl-call-inspector');inspector.hidden=true;inspector.setAttribute('aria-label','动画效果调用列表');
 function showCalls(title,calls){inspector.replaceChildren();const heading=make('div','rl-call-heading');heading.append(make('h2','',title));const close=make('button','rl-control','关闭');close.type='button';close.addEventListener('click',()=>{inspector.hidden=true;});heading.append(close);inspector.append(heading,make('p','','一个效果定义，多次调用。选择调用查看方向、触发方式和真实身份；小样不执行路由切换。'));
  for(const route of calls){const item=make('button','rl-call-row');item.type='button';item.dataset.callBindingId=route.id;item.append(make('strong','',`${route.binding.fields.fromPage.split('.').at(-1)} → ${route.binding.fields.toPage.split('.').at(-1)}`),make('span','',`${route.binding.fields.trigger} / ${route.binding.fields.definitionRef}`),make('small','',route.id));item.addEventListener('click',()=>selectBinding(route));inspector.append(item);}inspector.hidden=false;
 }
 const bundles=[{ids:['page.home','page.discography'],y:380,x:425},{ids:['page.discography','page.newsletter'],y:440,x:875},{ids:['page.home','page.newsletter'],y:520,x:650}];
 for(const bundle of bundles){const panels=bundle.ids.map(id=>layout.panels.find(panel=>panel.id===id)),a={x:panels[0].x+160,y:310},b={x:panels[1].x+160,y:310},calls=layout.routes.filter(route=>!route.self&&bundle.ids.includes(route.binding.fields.fromPage)&&bundle.ids.includes(route.binding.fields.toPage));
  const points=[a,{x:a.x,y:bundle.y-12},{x:a.x+12,y:bundle.y},{x:b.x-12,y:bundle.y},{x:b.x,y:bundle.y-12},b];
  svg.append(svgNode(doc,'path',{class:'rl-summary-trace',d:rhineTracePath({points},[])}));
  const button=make('button','rl-bundle',`${calls.length} 个调用 ↗`);button.type='button';button.style.left=bundle.x+'px';button.style.top=bundle.y+'px';button.setAttribute('aria-label',`${bundle.ids.join(' 与 ')} 的 ${calls.length} 个调用`);button.addEventListener('click',()=>showCalls(bundle.ids.map(id=>id.split('.').at(-1).toUpperCase()).join(' ⇄ '),calls));world.append(button);
 }
 const library=make('nav','rl-effect-library');library.setAttribute('aria-label','可复用动画效果库');library.append(make('span','','效果库 / DEFINE ONCE, CALL MANY'));
 const names={'td.wipeCover':'覆盖切换','td.wipeUncover':'揭幕进入','td.decodeHeadline':'标题解码','td.entranceHome':'主页入场'};
 for(const definition of new Set(layout.routes.map(route=>route.binding.fields.definitionRef))){const calls=layout.routes.filter(route=>route.binding.fields.definitionRef===definition),button=make('button','rl-effect',`${names[definition]||definition} · ${calls.length}`);button.type='button';button.dataset.definitionId=definition;button.addEventListener('click',()=>{host.dataset.selectedDefinitionId=definition;showCalls(`${names[definition]||definition} / ${calls.length} 次调用`,calls);});library.append(button);}
 camera.append(space);space.append(world);viewport.append(camera);
 const footer=make('div','rl-footer'),selection=make('output','rl-selection','选择页面关系或动画效果，按需查看调用。'),poseOutput=make('output','rl-pose');selection.setAttribute('aria-live','polite');footer.append(selection,poseOutput);host.replaceChildren(header,intro,viewport,library,footer,inspector);
 let activationSeq=0,pitch=8,yaw=-5,targetPitch=8,targetYaw=-5,frozen=false,drag=null,zoom=1,panX=0,panY=0,handle=0,last=0,disposed=false;
 const reduced=doc.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)'),signal=new AbortController(),on=(el,event,callback,options={})=>el.addEventListener(event,callback,{...options,signal:signal.signal});
 function apply(){camera.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;world.style.transform=`rotateX(${pitch}deg) rotateY(${yaw}deg)`;host.dataset.pitch=String(pitch);host.dataset.yaw=String(yaw);host.dataset.zoom=String(zoom);poseOutput.textContent=`RX ${pitch.toFixed(2)}° / RY ${yaw.toFixed(2)}° / ${(zoom*100).toFixed(1)}%`;}
 function fit(){zoom=Math.max(.9,Math.min(1.35,(viewport.clientWidth-48)/1300,(viewport.clientHeight-10)/650));panX=(viewport.clientWidth-1300*zoom)/2;panY=(viewport.clientHeight-650*zoom)/2;apply();}
 function tick(now){handle=0;if(disposed||doc.hidden||frozen||reduced?.matches)return;const dt=last?Math.min(64,now-last):16;last=now;const ease=1-Math.exp(-dt/85);pitch+=(targetPitch-pitch)*ease;yaw+=(targetYaw-yaw)*ease;apply();if(Math.abs(pitch-targetPitch)+Math.abs(yaw-targetYaw)>.001)handle=requestAnimationFrame(tick);}
 function animate(){if(!handle&&!frozen&&!reduced?.matches&&!doc.hidden){last=0;handle=requestAnimationFrame(tick);}}
 on(viewport,'pointermove',event=>{
  if(drag){panX=drag.panX+event.clientX-drag.x;panY=drag.panY+event.clientY-drag.y;apply();return;}
  if(frozen||viewport.contains(doc.activeElement)&&doc.activeElement.matches('button'))return;
  const rect=viewport.getBoundingClientRect();targetPitch=8+(event.clientY-rect.top-rect.height/2)/rect.height*3;targetYaw=-5+(event.clientX-rect.left-rect.width/2)/rect.width*3;animate();
 });
 on(viewport,'pointerdown',event=>{cancelAnimationFrame(handle);handle=0;if(event.target.closest('button'))return;drag={x:event.clientX,y:event.clientY,panX,panY};viewport.setPointerCapture(event.pointerId);});
 on(viewport,'pointerup',()=>{drag=null;});on(viewport,'pointercancel',()=>{drag=null;});
 on(viewport,'focusin',()=>{cancelAnimationFrame(handle);handle=0;});
 on(viewport,'wheel',event=>{event.preventDefault();cancelAnimationFrame(handle);handle=0;const rect=viewport.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,next=Math.max(.9,Math.min(1.6,zoom*Math.exp(-event.deltaY*.001)));panX=x-(x-panX)*next/zoom;panY=y-(y-panY)*next/zoom;zoom=next;apply();},{passive:false});
 on(viewport,'keydown',event=>{if(event.target!==viewport||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();cancelAnimationFrame(handle);handle=0;pitch=targetPitch=Math.max(6.5,Math.min(9.5,pitch+(event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0)));yaw=targetYaw=Math.max(-6.5,Math.min(-3.5,yaw+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0)));apply();});
 on(theme,'click',()=>{const dark=host.dataset.deck!=='dark';host.dataset.deck=dark?'dark':'light';theme.setAttribute('aria-pressed',String(dark));theme.textContent=dark?'洁净实验室':'夜间观测';});
 on(expand,'click',()=>{const expanded=host.dataset.routes!=='expanded';host.dataset.routes=expanded?'expanded':'summary';expand.setAttribute('aria-pressed',String(expanded));expand.textContent=expanded?'收起调用接口':'展开15个调用接口';inspector.hidden=true;});
 on(still,'click',()=>{frozen=!frozen;still.setAttribute('aria-pressed',String(frozen));still.textContent=frozen?'恢复姿态':'冻结姿态';if(frozen){cancelAnimationFrame(handle);handle=0;}else animate();});
 on(reset,'click',()=>{pitch=targetPitch=8;yaw=targetYaw=-5;fit();});
 on(doc,'visibilitychange',()=>{if(doc.hidden){cancelAnimationFrame(handle);handle=0;}else animate();});
 const resize=new ResizeObserver(fit);resize.observe(viewport);fit();
 const dispose=()=>{disposed=true;signal.abort();resize.disconnect();cancelAnimationFrame(handle);};on(doc.defaultView,'pagehide',dispose,{once:true});
 return {layout,dispose};
}

export function mermaidProjection(topology) {
  const identities = new Map(topology.nodes.map((node, index) => [`n${index}`, node]));
  const ids = new Map([...identities].map(([safe, node]) => [node.id, safe]));
  return { identities, source: ['flowchart TB', ...[...identities].map(([safe,node]) => `  ${safe}["${node.id}"]`), ...topology.edges.map(edge => `  ${ids.get(edge.from)} --> ${ids.get(edge.to)}`)].join('\n') };
}
export async function renderTopology(host, topology, mermaid, open) {
  const { identities, source } = mermaidProjection(topology);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'dark', flowchart: { htmlLabels: false }, suppressErrorRendering: true });
  const renderId=`cwTopology${Date.now()}`;
  const { svg } = await mermaid.render(renderId, source);
  const parser = new host.ownerDocument.defaultView.DOMParser(), parsed = parser.parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror,script,foreignObject')) throw new Error('MERMAID_UNSAFE_OUTPUT');
  const root = parsed.documentElement;
  if (root.localName.toLowerCase() !== 'svg' || [root,...root.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => /^on/i.test(attribute.name)||['href','xlink:href'].includes(attribute.name.toLowerCase())&&!attribute.value.startsWith('#')))) throw new Error('MERMAID_UNSAFE_OUTPUT');
  const seen = new Set();
  for (const group of root.querySelectorAll('g.node')) {
    const id=group.getAttribute('id')||'',localId=id.startsWith(renderId+'-')?id.slice(renderId.length+1):id;
    const safe = /^flowchart-(n\d+)-\d+$/.exec(localId)?.[1], object = identities.get(safe);
    if (!object || seen.has(safe)) throw new Error('MERMAID_NODE_MAPPING: '+String(group.getAttribute('id')||'missing').slice(0,100));
    seen.add(safe);group.setAttribute('data-node-id',object.id);group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`${object.kind}: ${object.id}`);
  }
  if (seen.size !== identities.size) throw new Error('MERMAID_NODE_MAPPING');
  const mounted = host.ownerDocument.importNode(root, true);host.replaceChildren(mounted);
  for (const group of mounted.querySelectorAll('[data-node-id]')) {
    const object = topology.nodes.find(node => node.id === group.getAttribute('data-node-id'));
    const activate = () => open(object.kind === 'page' ? 'page' : 'transition', object.id);
    group.addEventListener('click', activate);group.addEventListener('keydown', event => {if(['Enter',' '].includes(event.key)){event.preventDefault();activate();}});
  }
  return { mappedNodes: seen.size, securityLevel: 'strict' };
}

export function wireframeRows(page, objects) {
  const rows = [];
  function visit(id, depth, seen) { if (seen.has(id) || rows.length >= 7) return; const object = objects.get(id); if (!object) return; if (['ComponentZone','Node'].includes(object.type)) rows.push({ objectId:id, depth, tag:object.fields.tag||object.fields.tagHint||object.fields.role||object.type,label:object.fields.gridLabel||object.fields.title||object.fields.domId||object.fields.tag||object.fields.tagHint||object.fields.role||object.type }); for(const child of object.children) visit(child,depth+1,new Set([...seen,id])); }
  const own=(page.children||[]).filter(id=>objects.get(id)?.type==='ComponentZone');
  for(const id of own)visit(id,0,new Set([page.objectId]));
  if(!rows.length)visit(page.objectId,0,new Set());return rows;
}

const NS = 'http://www.w3.org/2000/svg';
// Unpolarized air-to-glass reflectance, sampled only when creating a portal.
export function glassReflectance(cosine, eta=1.5) {
  if(!Number.isFinite(cosine)||!Number.isFinite(eta)||eta<=1)throw new TypeError('INVALID_GLASS_OPTICS');
  const c=Math.max(0,Math.min(1,cosine)),t=Math.sqrt(1-(1-c*c)/(eta*eta));
  const parallel=(eta*c-t)/(eta*c+t),perpendicular=(c-eta*t)/(c+eta*t);
  return (parallel*parallel+perpendicular*perpendicular)/2;
}
export function svgNode(document, tag, attributes = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
export function cubicPoint(points, t) {
  const u = 1 - t;
  return { x:u*u*u*points[0].x+3*u*u*t*points[1].x+3*u*t*t*points[2].x+t*t*t*points[3].x,
    y:u*u*u*points[0].y+3*u*u*t*points[1].y+3*u*t*t*points[2].y+t*t*t*points[3].y };
}
export function orbitLayout(topology) {
  const coordinates = { 'page.home':{x:310,y:370}, 'page.discography':{x:890,y:205}, 'page.newsletter':{x:945,y:575} };
  const positions = new Map(topology.pages.map((page,index)=>[page.objectId,coordinates[page.objectId]||{x:300+index*310,y:350}]));
  const groups = new Map();
  for(const binding of topology.bindings){const key=[binding.fields.fromPage,binding.fields.toPage].sort().join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(binding);}
  const orbits=[];
  for(const group of groups.values()) for(const [index,binding] of group.entries()){
    const a=positions.get(binding.fields.fromPage), b=positions.get(binding.fields.toPage);
    if(!a||!b)throw new Error('ORBIT_PAGE_MISSING');
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,normal={x:-dy/length,y:dx/length};
    const direction=binding.fields.fromPage<binding.fields.toPage?1:-1;
    const phi=(1+Math.sqrt(5))/2,rank=index-(group.length-1)/2;
    const bend=Math.sign(rank)*(Math.pow(phi,Math.abs(rank)*.7)-1)*48*direction;
    const start={x:a.x+dx/length*122,y:a.y+dy/length*122},end={x:b.x-dx/length*122,y:b.y-dy/length*122};
    const self=binding.fields.fromPage===binding.fields.toPage;
    const points=self?(binding.fields.fromPage==='page.home'?
      [{x:a.x-108,y:a.y+56},{x:a.x-330,y:a.y+175},{x:a.x-330,y:a.y-175},{x:a.x-108,y:a.y-56}]:
      [{x:a.x-56,y:a.y-108},{x:a.x-175,y:a.y-250},{x:a.x+175,y:a.y-250},{x:a.x+56,y:a.y-108}]):
      [start,{x:start.x+(end.x-start.x)*.32+normal.x*bend,y:start.y+(end.y-start.y)*.32+normal.y*bend},{x:start.x+(end.x-start.x)*.68+normal.x*bend,y:start.y+(end.y-start.y)*.68+normal.y*bend},end];
    // Spread markers along the curve as well as perpendicular to avoid dense parallel hit targets.
    const t=Math.max(.3,Math.min(.8,1/phi+rank*.045)),beacon=cubicPoint(points,t),u=1-t;
    const tangent={x:3*u*u*(points[1].x-points[0].x)+6*u*t*(points[2].x-points[1].x)+3*t*t*(points[3].x-points[2].x),y:3*u*u*(points[1].y-points[0].y)+6*u*t*(points[2].y-points[1].y)+3*t*t*(points[3].y-points[2].y)};
    orbits.push({binding,points,beacon,angle:Math.atan2(tangent.y,tangent.x)*180/Math.PI,path:`M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`});
  }
  return {positions,orbits};
}
export function renderAstrolabe(host, topology, objects, open) {
  const document=host.ownerDocument, s=(tag,attrs,text)=>svgNode(document,tag,attrs,text),layout=orbitLayout(topology);
  const svg=s('svg',{class:'astrolabe',viewBox:'0 0 1300 760',role:'group','aria-label':'三个页面星盘与十五条独立世界线'});
  const defs=s('defs'),filter=s('filter',{id:'hand-drawn-ink',x:'-8%',y:'-8%',width:'116%',height:'116%'});
  filter.append(s('feTurbulence',{type:'fractalNoise',baseFrequency:'.035',numOctaves:3,seed:9,result:'noise'}),s('feDisplacementMap',{in:'SourceGraphic',in2:'noise',scale:1.6,xChannelSelector:'R',yChannelSelector:'G'}));defs.append(filter);
  const beam=s('filter',{id:'beam-glow',x:'-12%',y:'-12%',width:'124%',height:'124%'}),merge=s('feMerge');beam.append(s('feGaussianBlur',{stdDeviation:1.25,result:'halo'}));merge.append(s('feMergeNode',{in:'halo'}),s('feMergeNode',{in:'SourceGraphic'}));beam.append(merge);defs.append(beam);
  const colors={'page.home':['#00E5FF','.18'],'page.discography':['#FFE600','.22'],'page.newsletter':['#F0F4FF','.15']};
  for(const [index,page]of topology.pages.entries()){
    const [color,alpha]=colors[page.objectId]||['#FFFFFF','.15'],gradient=s('radialGradient',{id:`portal-aura-${index}`});
    gradient.append(s('stop',{offset:0,'stop-color':color,'stop-opacity':alpha}),s('stop',{offset:'.42','stop-color':color,'stop-opacity':alpha}),s('stop',{offset:1,'stop-color':color,'stop-opacity':0}));defs.append(gradient);
  }
  const shadow=s('filter',{id:'portal-shadow',x:'-50%',y:'-100%',width:'200%',height:'300%'});shadow.append(s('feGaussianBlur',{stdDeviation:9}));defs.append(shadow);
  svg.append(defs);
  const depth=s('g',{class:'depth-scaffold','aria-hidden':'true'});
  for(let i=0;i<9;i++){const y=430+i*i*5;depth.append(s('path',{d:`M -100 ${y} Q 650 ${y-65} 1400 ${y}`,class:'depth-floor'}));}
  for(let i=-4;i<=4;i++)depth.append(s('path',{d:`M 650 330 L ${650+i*240} 900`,class:'depth-floor'}));
  for(const page of topology.pages){const p=layout.positions.get(page.objectId);depth.append(s('ellipse',{cx:p.x+8,cy:p.y+163,rx:116,ry:19,class:'portal-contact'}),s('ellipse',{cx:p.x,cy:p.y+159,rx:114,ry:20,class:'portal-pedestal'}),s('ellipse',{cx:p.x,cy:p.y+159,rx:89,ry:13,class:'depth-floor'}),s('path',{d:`M ${p.x} ${p.y+122} V ${p.y+159}`,class:'depth-anchor'}));}
  svg.append(depth);
  const backdrop=s('g',{'aria-hidden':'true',class:'portal-backdrop'});
  for(const [index,page]of topology.pages.entries()){
    const p=layout.positions.get(page.objectId);backdrop.append(s('circle',{cx:p.x,cy:p.y,r:280,fill:`url(#portal-aura-${index})`}),s('text',{x:p.x-205,y:p.y+130,class:'portal-watermark'},`0${index+1}`),s('path',{d:`M ${p.x-220} ${p.y+170} L ${p.x+160} ${p.y-210} M ${p.x-190} ${p.y+170} L ${p.x+190} ${p.y-210}`,class:'construction diagonal-guide'}));
  }
  svg.append(backdrop);
  const activate=(group,kind,id)=>{group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('data-node-id',id);group.addEventListener('click',()=>open(kind,id));group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();open(kind,id);}});};
  const photons=[];
  for(const [index,orbit] of layout.orbits.entries()){
    const {binding,beacon}=orbit,group=s('g',{class:`worldline${index%3===0?' solar':''}`,'aria-label':`${binding.fields.fromPage} → ${binding.fields.toPage} / ${binding.objectId}`});
    group.append(s('title',{},`${binding.objectId} · ${binding.fields.definitionRef} · ${binding.fields.trigger}`),s('path',{d:orbit.path,class:'orbit-path',pathLength:1}),s('path',{d:orbit.path,class:'orbit-hit'}));
    const photon=s('circle',{r:2.6,class:'photon',cx:orbit.points[0].x,cy:orbit.points[0].y});group.append(photon);photons.push({element:photon,points:orbit.points,phase:index*.173});
    group.append(s('circle',{cx:beacon.x,cy:beacon.y,r:18,fill:'transparent'}),s('path',{d:`M ${beacon.x} ${beacon.y-9} l 9 9 -9 9 -9 -9 Z`,class:'beacon-ring'}),s('path',{d:`M ${beacon.x} ${beacon.y-4} l 4 4 -4 4 -4 -4 Z`,class:'beacon-core'}),s('path',{d:`M ${beacon.x-16} ${beacon.y} h 5 M ${beacon.x+11} ${beacon.y} h 5 M ${beacon.x} ${beacon.y-16} v 5 M ${beacon.x} ${beacon.y+11} v 5`,class:'beacon-coordinate'}),s('text',{x:beacon.x+18,y:beacon.y-18,class:'orbit-label'},`θ ${orbit.angle.toFixed(1)}° // ${binding.fields.definitionRef}`));
    activate(group,'transition',binding.objectId);svg.append(group);
  }
  for(const [index,page] of topology.pages.entries()){
    const p=layout.positions.get(page.objectId),group=s('g',{class:'portal',transform:`translate(${p.x} ${p.y})`,'aria-label':page.fields.title});
    group.append(s('circle',{r:120,class:'portal-disc'}),s('circle',{r:122,cy:5,class:'portal-bevel'}),s('path',{d:'M -116 -33 A 121 121 0 0 1 65 -102',class:'portal-rim-light'}),s('path',{d:'M 117 34 A 121 121 0 0 1 73 96',class:'portal-rim-light'}));
    const outer=s('g',{class:'ink outer'});outer.append(s('circle',{r:140}),s('circle',{r:134}));
    for(let tick=0;tick<72;tick++){const angle=tick*Math.PI/36,r=tick%6?136:130;outer.append(s('line',{x1:Math.cos(angle)*r,y1:Math.sin(angle)*r,x2:Math.cos(angle)*140,y2:Math.sin(angle)*140}));}group.append(outer);
    group.append(s('circle',{r:116,class:'ink'}),s('circle',{r:104,class:'construction'}),s('rect',{x:-84,y:-52,width:168,height:104,class:'construction',transform:'rotate(-24)'}),s('path',{d:'M -180 104 H 180 M -180 -104 H 180 M 0 -170 V 170',class:'construction'}));
    group.append(s('circle',{r:96,class:'aperture-rim'}),s('circle',{r:101,class:'aperture-rim secondary-rim'}));
    const rightLabel=page.objectId!=='page.home';
    group.append(s('text',{x:rightLabel?174:0,y:rightLabel?6:176,class:'portal-name'+(rightLabel?' portal-label-right':''),'text-anchor':rightLabel?'start':'middle'},page.objectId.split('.').at(-1).toUpperCase()),s('text',{x:rightLabel?174:0,y:rightLabel?-20:-161,class:'portal-caption'+(rightLabel?' portal-label-right':''),'text-anchor':rightLabel?'start':'middle'},`0${index+1} // PAGE PORTAL`),s('text',{x:rightLabel?174:0,y:rightLabel?28:197,class:'portal-caption'+(rightLabel?' portal-label-right':''),'text-anchor':rightLabel?'start':'middle'},page.fields.route));
    activate(group,'page',page.objectId);svg.append(group);
  }
  const miniatures=document.createElement('div');miniatures.className='portal-miniatures';miniatures.setAttribute('aria-hidden','true');miniatures.setAttribute('inert','');
  const routes={'page.home':'/','page.discography':'/discography/','page.newsletter':'/newsletter/'};
  for(const page of topology.pages){
    const route=routes[page.objectId];if(!route||route!==page.fields.route)throw new Error('MINIATURE_ROUTE_NOT_ALLOWED');
    const p=layout.positions.get(page.objectId),window=document.createElement('div');window.className='portal-miniature';window.dataset.page=page.objectId;window.style.left=`${p.x-90}px`;window.style.top=`${p.y-90}px`;
    const frame=document.createElement('iframe');frame.className='miniature-page';frame.title=`${page.fields.title} / 实际网页静态缩略`;frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('tabindex','-1');frame.setAttribute('scrolling','no');frame.setAttribute('referrerpolicy','no-referrer');frame.setAttribute('loading','eager');frame.src='http://127.0.0.1:4321'+route;
    const status=document.createElement('span');status.className='miniature-loading';status.textContent='CONNECTING / '+page.objectId.split('.').at(-1).toUpperCase();frame.addEventListener('load',()=>{window.dataset.loaded='true';status.hidden=true;});frame.addEventListener('error',()=>{status.textContent='PREVIEW OFFLINE / 打开页面重试';});
    const glass=s('svg',{class:'portal-glass',viewBox:'0 0 180 180','aria-hidden':'true'}),glassDefs=s('defs'),reflection=s('radialGradient',{id:'glass-'+page.objectId.replaceAll('.','-')});
    for(const radius of [0,.35,.6,.75,.85,.9,.94,.97,.985,.995,1])reflection.append(s('stop',{offset:radius,'stop-color':'#d6efff','stop-opacity':(glassReflectance(Math.sqrt(1-radius*radius))*.32).toFixed(4)}));
    glassDefs.append(reflection);glass.append(glassDefs,s('circle',{cx:90,cy:90,r:90,fill:'url(#'+reflection.id+')'}));window.append(frame,glass,status);miniatures.append(window);
  }
  host.replaceChildren(svg,miniatures);return {...layout,svg,photons};
}

export function generateStars(count=520, random=Math.random) {
  return Array.from({length:count},(_,i)=>{
    const bright=i%10===0,u=Math.max(.0001,random()),flux=Math.min(1,.018*Math.pow(u,-.65));
    return {x:random(),y:random(),z:i%3+1,bright,radius:bright?1.1+flux:.5+random()*.7,alpha:bright?.55+flux*.3:.08+flux*.4,phase:random()*Math.PI*2};
  });
}
export function startCosmos(canvas, getAttractor=()=>null, reportSample=()=>{}) {
  const context=canvas?.getContext('2d');if(!context)return ()=>{};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),lifetime=new AbortController(),signal=lifetime.signal;
  const stars=generateStars(),pointer={x:0,y:0},smooth={x:0,y:0};let width=1,height=1,handle=0,slow=0,count=520,last=0,manualPaused=false,samplingEpoch=0,lastBearing='',lastTilt='';
  function resize(){cancelAnimationFrame(handle);samplingEpoch++;last=0;width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);draw(performance.now());}
  function draw(now){
    handle=0;if(document.hidden)return;const workStart=performance.now(),paused=reduced.matches||manualPaused;
    const frameDelta=last?now-last:0,delta=Math.min(64,Math.max(1,frameDelta||16));last=now;
    // Long host scheduling gaps are recorded, not interpreted as rendering overload.
    if(frameDelta>0&&frameDelta<250){if(frameDelta>35)slow++;else slow=Math.max(0,slow-2);if(slow>60)count=360;else if(slow===0)count=520;}
    const damping=1-Math.exp(-delta/360);smooth.x+=(pointer.x-smooth.x)*damping;smooth.y+=(pointer.y-smooth.y)*damping;
    const bearing=(smooth.x*8).toFixed(3)+'px',tilt=(smooth.y*8).toFixed(3)+'px';
    if(bearing!==lastBearing){document.documentElement.style.setProperty('--bearing',bearing);lastBearing=bearing;}
    if(tilt!==lastTilt){document.documentElement.style.setProperty('--tilt',tilt);lastTilt=tilt;}context.clearRect(0,0,width,height);
    const attractor=paused?null:getAttractor(),near=[];
    for(let i=0;i<count;i++){
      const star=stars[i],depth=star.z/3,offset=paused?0:1,x0=star.x*width+smooth.x*depth*22*offset,y0=star.y*height+smooth.y*depth*16*offset;
      let x=x0,y=y0;if(attractor){const dx=attractor.x-x,dy=attractor.y-y,d=Math.hypot(dx,dy);if(d<160&&d>1){const force=(1-d/160)*2.2*depth;x+=dx/d*force;y+=dy/d*force;if(near.length<48)near.push({x,y});}}
      context.globalAlpha=star.alpha*(.45+depth*.55)*(paused?1:.9+.1*Math.sin(now*.0003+star.phase));context.fillStyle=star.z===1?'#8ca9c9':star.z===2?'#c6dff5':'#f0f9ff';context.beginPath();context.arc(x,y,star.radius,0,Math.PI*2);context.fill();
      if(star.bright){context.strokeStyle='#EAE6DF';context.lineWidth=.4;context.beginPath();context.moveTo(x-4,y);context.lineTo(x+4,y);context.moveTo(x,y-4);context.lineTo(x,y+4);context.stroke();}
    }
    const buckets=new Map();context.lineWidth=.45;context.strokeStyle='#EAE6DF';
    for(const point of near){const bx=Math.floor(point.x/60),by=Math.floor(point.y/60);let links=0;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of buckets.get(`${bx+dx}:${by+dy}`)||[]){const distance=Math.hypot(point.x-other.x,point.y-other.y);if(distance<60&&links++<2){context.globalAlpha=.12*(1-distance/60);context.beginPath();context.moveTo(point.x,point.y);context.lineTo(other.x,other.y);context.stroke();}}const key=`${bx}:${by}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(point);}
    context.globalAlpha=1;reportSample({kind:'cosmos',frameDelta:paused?0:frameDelta,drawMs:performance.now()-workStart,particles:count,paused,pointerX:smooth.x,pointerY:smooth.y,samplingEpoch,width,height,schedulingGap:frameDelta>=250});if(!paused)handle=requestAnimationFrame(draw);
  }
  window.addEventListener('pointermove',e=>{if(reduced.matches||manualPaused)return;pointer.x=e.clientX/width-.5;pointer.y=e.clientY/height-.5;},{signal});
  window.addEventListener('resize',resize,{signal});document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(handle);samplingEpoch++;last=0;if(!document.hidden)draw(performance.now());},{signal});
  reduced.addEventListener('change',()=>{cancelAnimationFrame(handle);samplingEpoch++;last=0;draw(performance.now());},{signal});resize();
  const stop=()=>{lifetime.abort();cancelAnimationFrame(handle);};
  stop.setPaused=value=>{manualPaused=!!value;cancelAnimationFrame(handle);samplingEpoch++;last=0;draw(performance.now());};return stop;
}
