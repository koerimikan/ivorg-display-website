export function mermaidProjection(topology) {
  const identities = new Map(topology.nodes.map((node, index) => [`n${index}`, node]));
  const ids = new Map([...identities].map(([safe, node]) => [node.id, safe]));
  return { identities, source: ['flowchart TB', ...[...identities].map(([safe,node]) => `  ${safe}["${node.id}"]`), ...topology.edges.map(edge => `  ${ids.get(edge.from)} --> ${ids.get(edge.to)}`)].join('\n') };
}
export async function renderTopology(host, topology, mermaid, open) {
  const { identities, source } = mermaidProjection(topology);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', flowchart: { htmlLabels: false }, suppressErrorRendering: true });
  const { svg } = await mermaid.render(`cwTopology${Date.now()}`, source);
  const parser = new host.ownerDocument.defaultView.DOMParser(), parsed = parser.parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror,script,foreignObject')) throw new Error('MERMAID_UNSAFE_OUTPUT');
  const root = parsed.documentElement;
  if (root.localName.toLowerCase() !== 'svg' || [...root.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => /^on/i.test(attribute.name)))) throw new Error('MERMAID_UNSAFE_OUTPUT');
  const seen = new Set();
  for (const group of root.querySelectorAll('g.node')) {
    const safe = /^flowchart-(n\d+)-\d+$/.exec(group.getAttribute('id') || '')?.[1], object = identities.get(safe);
    if (!object || seen.has(safe)) throw new Error('MERMAID_NODE_MAPPING');
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
  function visit(id, depth, seen) { if (seen.has(id) || rows.length >= 7) return; const object = objects.get(id); if (!object) return; if (['ComponentZone','Node'].includes(object.type)) rows.push({ objectId:id, depth, tag:object.fields.tag||object.fields.tagHint||object.fields.role||object.type }); for(const child of object.children) visit(child,depth+1,new Set([...seen,id])); }
  visit(page.objectId,0,new Set());return rows;
}

const NS = 'http://www.w3.org/2000/svg';
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
    const points=[start,{x:start.x+(end.x-start.x)*.32+normal.x*bend,y:start.y+(end.y-start.y)*.32+normal.y*bend},{x:start.x+(end.x-start.x)*.68+normal.x*bend,y:start.y+(end.y-start.y)*.68+normal.y*bend},end];
    // Spread markers along the curve as well as perpendicular to avoid dense parallel hit targets.
    const t=Math.max(.3,Math.min(.8,1/phi+rank*.045)),beacon=cubicPoint(points,t),u=1-t;
    const tangent={x:3*u*u*(points[1].x-points[0].x)+6*u*t*(points[2].x-points[1].x)+3*t*t*(points[3].x-points[2].x),y:3*u*u*(points[1].y-points[0].y)+6*u*t*(points[2].y-points[1].y)+3*t*t*(points[3].y-points[2].y)};
    orbits.push({binding,points,beacon,angle:Math.atan2(tangent.y,tangent.x)*180/Math.PI,path:`M ${start.x} ${start.y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${end.x} ${end.y}`});
  }
  return {positions,orbits};
}
export function renderAstrolabe(host, topology, objects, open) {
  const document=host.ownerDocument, s=(tag,attrs,text)=>svgNode(document,tag,attrs,text),layout=orbitLayout(topology);
  const svg=s('svg',{class:'astrolabe',viewBox:'0 0 1300 760',role:'group','aria-label':'三个页面星盘与十五条独立世界线'});
  const defs=s('defs'),filter=s('filter',{id:'hand-drawn-ink',x:'-8%',y:'-8%',width:'116%',height:'116%'});
  filter.append(s('feTurbulence',{type:'fractalNoise',baseFrequency:'.035',numOctaves:3,seed:9,result:'noise'}),s('feDisplacementMap',{in:'SourceGraphic',in2:'noise',scale:1.6,xChannelSelector:'R',yChannelSelector:'G'}));defs.append(filter);svg.append(defs);
  const activate=(group,kind,id)=>{group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('data-node-id',id);group.addEventListener('click',()=>open(kind,id));group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();open(kind,id);}});};
  const photons=[];
  for(const [index,orbit] of layout.orbits.entries()){
    const {binding,beacon}=orbit,group=s('g',{class:'worldline','aria-label':`${binding.fields.fromPage} → ${binding.fields.toPage} / ${binding.objectId}`});
    group.append(s('title',{},`${binding.objectId} · ${binding.fields.definitionRef} · ${binding.fields.trigger}`),s('path',{d:orbit.path,class:'orbit-path',pathLength:1}),s('path',{d:orbit.path,class:'orbit-hit'}));
    const photon=s('circle',{r:1.8,class:'photon',cx:orbit.points[0].x,cy:orbit.points[0].y});group.append(photon);photons.push({element:photon,points:orbit.points,phase:index*.173});
    group.append(s('circle',{cx:beacon.x,cy:beacon.y,r:18,fill:'transparent'}),s('circle',{cx:beacon.x,cy:beacon.y,r:6,class:'beacon-ring'}),s('path',{d:`M ${beacon.x-3} ${beacon.y-3} l 6 6 M ${beacon.x+3} ${beacon.y-3} l -6 6`,class:'beacon-cross'}),s('text',{x:beacon.x+14,y:beacon.y-14,class:'orbit-label'},`θ ${orbit.angle.toFixed(1)}° // ${binding.fields.definitionRef}`));
    activate(group,'transition',binding.objectId);svg.append(group);
  }
  for(const [index,page] of topology.pages.entries()){
    const p=layout.positions.get(page.objectId),group=s('g',{class:'portal',transform:`translate(${p.x} ${p.y})`,'aria-label':page.fields.title});
    group.append(s('circle',{r:144,class:'portal-disc'}));
    const outer=s('g',{class:'ink outer'});outer.append(s('circle',{r:140}),s('circle',{r:134}));
    for(let tick=0;tick<72;tick++){const angle=tick*Math.PI/36,r=tick%6?136:130;outer.append(s('line',{x1:Math.cos(angle)*r,y1:Math.sin(angle)*r,x2:Math.cos(angle)*140,y2:Math.sin(angle)*140}));}group.append(outer);
    group.append(s('circle',{r:116,class:'ink'}),s('circle',{r:104,class:'construction'}),s('rect',{x:-84,y:-52,width:168,height:104,class:'construction',transform:'rotate(-24)'}),s('path',{d:'M -180 104 H 180 M -180 -104 H 180 M 0 -170 V 170',class:'construction'}));
    const miniature=s('g',{class:'miniature',transform:'translate(-70 -45)'}),rows=wireframeRows(page,objects);
    miniature.append(s('rect',{x:0,y:0,width:140,height:82}),s('line',{x1:21,y1:0,x2:21,y2:82}));
    rows.forEach((row,i)=>{const offset=Math.min(25,row.depth*6);miniature.append(s('rect',{x:28+offset,y:8+i*9,width:102-offset,height:5}));});group.append(miniature);
    group.append(s('text',{x:0,y:70,class:'portal-name'},page.objectId.split('.').at(-1).toUpperCase()),s('text',{x:0,y:-161,class:'portal-caption'},`0${index+1} // PAGE PORTAL`),s('text',{x:0,y:174,class:'portal-caption'},page.fields.route));
    activate(group,'page',page.objectId);svg.append(group);
  }
  host.replaceChildren(svg);return {...layout,svg,photons};
}

export function generateStars(count=520, random=Math.random) {
  return Array.from({length:count},(_,i)=>{
    const bright=i%10===0,u=Math.max(.0001,random()),flux=Math.min(1,.018*Math.pow(u,-.65));
    return {x:random(),y:random(),z:i%3+1,bright,radius:bright?1.1+flux:.5+random()*.7,alpha:bright?.55+flux*.3:.08+flux*.4,phase:random()*Math.PI*2};
  });
}
export function startCosmos(canvas, getAttractor=()=>null) {
  const context=canvas?.getContext('2d');if(!context)return ()=>{};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),lifetime=new AbortController(),signal=lifetime.signal;
  const stars=generateStars(),pointer={x:0,y:0},smooth={x:0,y:0};let width=1,height=1,handle=0,slow=0,count=520,last=0;
  function resize(){cancelAnimationFrame(handle);width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);draw(performance.now());}
  function draw(now){
    handle=0;if(document.hidden)return;
    const delta=last?now-last:16;last=now;if(delta>35)slow++;else slow=Math.max(0,slow-1);if(slow>60)count=360;
    smooth.x+=(pointer.x-smooth.x)*.045;smooth.y+=(pointer.y-smooth.y)*.045;context.clearRect(0,0,width,height);
    const attractor=reduced.matches?null:getAttractor(),near=[];
    for(let i=0;i<count;i++){
      const star=stars[i],depth=star.z/3,offset=reduced.matches?0:1,x0=star.x*width+smooth.x*depth*22*offset,y0=star.y*height+smooth.y*depth*16*offset;
      let x=x0,y=y0;if(attractor){const dx=attractor.x-x,dy=attractor.y-y,d=Math.hypot(dx,dy);if(d<160&&d>1){const force=(1-d/160)*2.2*depth;x+=dx/d*force;y+=dy/d*force;if(near.length<48)near.push({x,y});}}
      context.globalAlpha=star.alpha*(reduced.matches?1:.9+.1*Math.sin(now*.0003+star.phase));context.fillStyle='#EAE6DF';context.beginPath();context.arc(x,y,star.radius,0,Math.PI*2);context.fill();
      if(star.bright){context.strokeStyle='#EAE6DF';context.lineWidth=.4;context.beginPath();context.moveTo(x-4,y);context.lineTo(x+4,y);context.moveTo(x,y-4);context.lineTo(x,y+4);context.stroke();}
    }
    const buckets=new Map();context.lineWidth=.45;context.strokeStyle='#EAE6DF';
    for(const point of near){const bx=Math.floor(point.x/60),by=Math.floor(point.y/60);let links=0;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of buckets.get(`${bx+dx}:${by+dy}`)||[]){const distance=Math.hypot(point.x-other.x,point.y-other.y);if(distance<60&&links++<2){context.globalAlpha=.12*(1-distance/60);context.beginPath();context.moveTo(point.x,point.y);context.lineTo(other.x,other.y);context.stroke();}}const key=`${bx}:${by}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(point);}
    context.globalAlpha=1;if(!reduced.matches)handle=requestAnimationFrame(draw);
  }
  window.addEventListener('pointermove',e=>{pointer.x=e.clientX/width-.5;pointer.y=e.clientY/height-.5;document.documentElement.style.setProperty('--bearing',`${pointer.x*8}px`);document.documentElement.style.setProperty('--tilt',`${pointer.y*8}px`);},{signal});
  window.addEventListener('resize',resize,{signal});document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(handle);last=0;if(!document.hidden)draw(performance.now());},{signal});
  reduced.addEventListener('change',()=>{cancelAnimationFrame(handle);draw(performance.now());},{signal});resize();
  return ()=>{lifetime.abort();cancelAnimationFrame(handle);};
}
