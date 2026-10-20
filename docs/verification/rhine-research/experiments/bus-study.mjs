import fs from 'node:fs';

// Isolated research model. It neither imports a browser nor changes the product.
const facts=JSON.parse(fs.readFileSync('.companion/rhine-research/topology-facts.json','utf8'));
const bindings=Object.entries(facts).flatMap(([pair,items])=>items.map(item=>({...item,from:pair.split(' -> ')[0],to:pair.split(' -> ')[1]})));
const pages=[{id:'page.home',x:310,y:370},{id:'page.discography',x:890,y:205},{id:'page.newsletter',x:945,y:575}];
const chips=[],routes=[],groups={HD:[],HN:[],DN:[]};
const kind=b=>b.from===b.to?'SELF':![b.from,b.to].includes('page.newsletter')?'HD':![b.from,b.to].includes('page.home')?'DN':'HN';
for(const b of bindings){const k=kind(b);if(k==='SELF')chips.push({...b,kind:k,x:b.from==='page.home'?200:1000,y:b.from==='page.home'?220:60});else groups[k].push(b);}
const slots={HD:[[550,180],[620,180],[690,180],[520,360],[590,360],[660,360],[730,360]],HN:[[550,550],[620,600],[690,650]],DN:[[1150,360],[1150,420],[1150,480]]};
const blocked=(x,y)=>pages.some(p=>x>p.x-172&&x<p.x+172&&y>p.y-112&&y<p.y+112);
const cellKey=p=>p.x+','+p.y,step=10,dirs=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],pressure=new Map();
function route(start,end){
 const goal=cellKey(end),best=new Map([[cellKey(start),0]]),back=new Map(),open=[{...start,g:0,f:Math.hypot(end.x-start.x,end.y-start.y)}];
 while(open.length){open.sort((a,b)=>a.f-b.f||a.x-b.x||a.y-b.y);const current=open.shift(),key=cellKey(current);if(current.g!==best.get(key))continue;
  if(key===goal){const path=[];let k=key;while(k){const [x,y]=k.split(',').map(Number);path.push({x,y});k=back.get(k);}return path.reverse();}
  for(const [dx,dy]of dirs){const x=current.x+dx*step,y=current.y+dy*step,nextKey=x+','+y;
   if(x<20||x>1280||y<20||y>740||blocked(x,y)||blocked(current.x+dx*step/2,current.y+dy*step/2))continue;
   const g=current.g+Math.hypot(dx,dy)*step+(pressure.get(nextKey)||0)*3;
   if(g>=(best.get(nextKey)??Infinity))continue;best.set(nextKey,g);back.set(nextKey,key);open.push({x,y,g,f:g+Math.hypot(end.x-x,end.y-y)});
  }
 }
 throw new Error('NO_RESEARCH_ROUTE '+JSON.stringify({start,end}));
}
for(const k of ['HD','HN','DN'])for(const [i,b]of groups[k].sort((a,b)=>a.id.localeCompare(b.id)).entries()){
 const [x,y]=slots[k][i],chip={...b,kind:k,x,y};chips.push(chip);
 let start,end;
 if(k==='HD'){start={x:490,y:300+i*20};end={x:710,y:130+i*20};}
 else if(k==='HN'){start={x:250+i*60,y:490};end={x:770,y:530+i*40};}
 else{start={x:810+i*80,y:330};end={x:1120,y:520+i*50};}
 const first=route(start,chip),second=route(chip,end);let path=[...first,...second.slice(1)];
 for(const p of path)pressure.set(cellKey(p),(pressure.get(cellKey(p))||0)+1);
 if(b.from!==(k==='HD'||k==='HN'?'page.home':'page.discography'))path=path.reverse();
 routes.push({id:b.id,from:b.from,to:b.to,points:path,kind:k,chip:{x,y}});
}
const project=(p,pitch,yaw)=>{const rx=pitch*Math.PI/180,ry=yaw*Math.PI/180,X=p.x-650,Y=p.y-380,x=X*Math.cos(ry),z=-X*Math.sin(ry),y=Y*Math.cos(rx)-z*Math.sin(rx),Z=Y*Math.sin(rx)+z*Math.cos(rx),s=1200/(1200-Z);return{x:650+x*s,y:380+y*s};};
const checks=[];
for(const [width,height]of [[1280,800],[1440,900],[1920,1080]])for(const pitch of [6,8,10])for(const yaw of [-7,-5,-3]){
 const zoom=Math.max(.25,Math.min(1.1,(width-96)/1380,(height-184)/800)),pan={x:(width-96-1300*zoom)/2,y:(height-184-760*zoom)/2};
 const screen=chips.map(chip=>({...chip,p:project(chip,pitch,yaw)})).map(c=>({...c,p:{x:48+pan.x+c.p.x*zoom,y:120+pan.y+c.p.y*zoom}}));
 let min=Infinity,pair=[];for(let i=0;i<screen.length;i++)for(let j=i+1;j<screen.length;j++){const d=Math.hypot(screen[i].p.x-screen[j].p.x,screen[i].p.y-screen[j].p.y);if(d<min){min=d;pair=[screen[i].id,screen[j].id];}}
 const clearOfBounds=screen.every(c=>c.p.x>=64&&c.p.x<=width-64&&c.p.y>=136&&c.p.y<=height-80);
 checks.push({width,height,pitch,yaw,zoom,minCenterDistancePx:min,pair,nonOverlapping32pxCircles:min>=32,screenBounds:clearOfBounds});
}
const diagonalOrOrthogonal=routes.every(r=>r.points.slice(1).every((p,i)=>{const dx=Math.abs(p.x-r.points[i].x),dy=Math.abs(p.y-r.points[i].y);return dx===0||dy===0||dx===dy;}));
const result={recordedAt:new Date().toISOString(),status:'GEOMETRY_FEASIBLE_RENDERING_NOT_VERIFIED',constraints:{perspective:1200,pitchRange:[6,10],yawRange:[-7,-3],hitDiameterCssPx:32},counts:{bindings:bindings.length,interPage:routes.length,inPlace:chips.filter(c=>c.kind==='SELF').length},chips,routes,checks,diagonalOrOrthogonal,overlapWarning:'Grid pressure is only a heuristic. Crossings, duplicate segments, chamfered face collisions, labels, line thickness and native DOM hit tests still require actual rendering.'};
const stats=routes.map(route=>{let turns=0;for(let i=1;i<route.points.length-1;i++){const a=route.points[i-1],b=route.points[i],c=route.points[i+1];if((b.x-a.x)*(c.y-b.y)!==(b.y-a.y)*(c.x-b.x))turns++;}return{id:route.id,turns,segments:turns+1};});
const sharedCells=new Map();for(const route of routes)for(const p of route.points){const key=cellKey(p);if(!sharedCells.has(key))sharedCells.set(key,new Set());sharedCells.get(key).add(route.id);}
const shared=[...sharedCells.values()].filter(ids=>ids.size>1);
result.routingCritique={perRoute:stats,compressedSegments:stats.reduce((s,x)=>s+x.segments,0),maxTurns:Math.max(...stats.map(x=>x.turns)),sharedGridPoints:shared.length,maxBindingsAtSharedPoint:Math.max(0,...shared.map(s=>s.size)),note:'Geometric reachability is not an approved visual layout.'};
fs.writeFileSync('.companion/rhine-research/bus-study.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({counts:result.counts,diagonalOrOrthogonal,minProjectedCenterDistance:Math.min(...checks.map(c=>c.minCenterDistancePx)),cases:checks.length,hitPass:checks.filter(c=>c.nonOverlapping32pxCircles).length,boundsPass:checks.filter(c=>c.screenBounds).length,routePoints:routes.reduce((s,r)=>s+r.points.length,0)},null,2));
