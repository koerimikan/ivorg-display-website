import fs from 'node:fs';
const candidate=JSON.parse(fs.readFileSync('.companion/rhine-research/corridor-study.json','utf8'));
const initial=JSON.parse(fs.readFileSync('.companion/rhine-research/bus-study.json','utf8'));
const dist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
const project=(p,pitch,yaw)=>{const rx=pitch*Math.PI/180,ry=yaw*Math.PI/180,X=p.x-650,Y=p.y-380,x=X*Math.cos(ry),z=-X*Math.sin(ry),y=Y*Math.cos(rx)-z*Math.sin(rx),Z=Y*Math.sin(rx)+z*Math.cos(rx),s=1200/(1200-Z);return{x:650+x*s,y:380+y*s};};
const worst=new Map();
for(const c of initial.checks)for(const route of candidate.routes){
 const points=route.points.map(p=>project(p,c.pitch,c.yaw));
 for(const chip of initial.chips){if(chip.id===route.id)continue;const p=project(chip,c.pitch,c.yaw);let nearest=Infinity;
  for(let i=1;i<points.length;i++)nearest=Math.min(nearest,dist(p,points[i-1],points[i])*c.zoom);
  if(nearest<16){const key=route.id+'|'+chip.id,prior=worst.get(key);if(!prior||nearest<prior.distanceCssPx)worst.set(key,{routeId:route.id,foreignChipId:chip.id,distanceCssPx:nearest,viewport:[c.width,c.height],pitch:c.pitch,yaw:c.yaw});}
 }
}
const sharedSegments=[];
for(let i=0;i<candidate.routes.length;i++)for(let j=i+1;j<candidate.routes.length;j++){
 const a=candidate.routes[i],b=candidate.routes[j];let overlap=false;
 for(let x=1;x<a.points.length&&!overlap;x++)for(let y=1;y<b.points.length&&!overlap;y++){
  const A=a.points[x-1],B=a.points[x],C=b.points[y-1],D=b.points[y];
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  if(cross(A,B,C)!==0||cross(A,B,D)!==0)continue;
  const axis=Math.abs(B.x-A.x)>=Math.abs(B.y-A.y)?'x':'y';
  const length=Math.min(Math.max(A[axis],B[axis]),Math.max(C[axis],D[axis]))-Math.max(Math.min(A[axis],B[axis]),Math.min(C[axis],D[axis]));
  if(length>1e-6)overlap=true;
 }
 if(overlap)sharedSegments.push([a.id,b.id]);
}
const result={recordedAt:new Date().toISOString(),reviewer:'Primary agent self counter-review; no external independent auditor',status:'CANDIDATE_FAILS_TOPOLOGY_CLARITY_GATE',foreignChipEncroachments:[...worst.values()].sort((a,b)=>a.distanceCssPx-b.distanceCssPx),routePairsWithCollinearOverlap:sharedSegments,findings:['Separated chip centers do not prevent unrelated wires from running through another chip','Fewer bends do not establish unambiguous route ownership','This is a mathematical counterexample, not a screenshot or browser hit-test result'],decision:'Do not ship the50-segment sketch as final routing. Prototype must add foreign-chip keepouts and explicit crossings or reframe semantic bus lanes; rerun clarity and identity gates.'};
fs.writeFileSync('.companion/rhine-research/counter-review.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,foreignRouteChipPairs:result.foreignChipEncroachments.length,collinearRoutePairs:sharedSegments.length,examples:result.foreignChipEncroachments.slice(0,3)},null,2));
