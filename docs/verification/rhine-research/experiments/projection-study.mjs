import fs from 'node:fs';
import {validateSpec} from '../../../../src/workbench-core/objects/l3.js';
import {projectTopology} from '../../../../src/workbench-core/objects/graph.js';
import {orbitLayout} from '../../../../src/workbench/shell/topology-renderer.js';

// Research-only geometric estimates, not a renderer or browser performance test.
const graph=validateSpec(fs.readFileSync('workbench/specs/ivorg.spec.xml','utf8')).graph;
const topology=projectTopology(graph),old=orbitLayout(topology);
const rad=degrees=>degrees*Math.PI/180;
function project({x,y,z=0},pitch=8,yaw=-5,perspective=1200){
 const X=x-650,Y=y-380,cy=Math.cos(rad(yaw)),sy=Math.sin(rad(yaw)),cx=Math.cos(rad(pitch)),sx=Math.sin(rad(pitch));
 const a=X*cy+z*sy,b=-X*sy+z*cy,y1=Y*cx-b*sx,z1=Y*sx+b*cx;
 const scale=perspective/(perspective-z1);
 return {x:650+a*scale,y:380+y1*scale,z:z1,scale};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const viewports=[[1280,800],[1440,900],[1920,1080]];
const existing=viewports.map(([width,height])=>{
 const zoom=Math.max(.25,Math.min(1.1,(width-96)/1380,(height-184)/800));
 let min=Infinity,pair=[];
 for(let i=0;i<old.orbits.length;i++)for(let j=i+1;j<old.orbits.length;j++){
  const d=distance(old.orbits[i].beacon,old.orbits[j].beacon)*zoom;
  if(d<min){min=d;pair=[old.orbits[i].binding.objectId,old.orbits[j].binding.objectId];}
 }
 return {width,height,zoom,minBeaconCenterDistancePx:min,pair,observation:'World-space distance assertions alone do not guarantee separated 32px screen hit targets.'};
});
const poses=[{pitch:0,yaw:0},{pitch:8,yaw:-5},{pitch:18,yaw:-14},{pitch:32,yaw:-25}].map(pose=>{
 const cards=[{id:'HOME',x:310,y:370,z:0},{id:'DISCOGRAPHY',x:890,y:205,z:0},{id:'NEWSLETTER',x:945,y:575,z:0}].map(card=>{
  const corners=[[-160,-100],[160,-100],[160,100],[-160,100]].map(([x,y])=>project({x:card.x+x,y:card.y+y,z:card.z},pose.pitch,pose.yaw));
  const bounds={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
  return {id:card.id,center:project(card,pose.pitch,pose.yaw),corners,bounds};
 });
 return {...pose,cards,screenWidthRatio:Math.max(...cards.map(c=>c.bounds.right-c.bounds.left))/Math.min(...cards.map(c=>c.bounds.right-c.bounds.left))};
});
const thumbnails={oldCircularArea:Math.PI*90**2,newFullFaceArea:320*200,areaRatio:320*200/(Math.PI*90**2),sourceViewport:[1280,800],fullFaceScale:.25,body16pxProjected:4,heading80pxProjected:20,insideLabelIsNotReadableBodyText:true,headerFooterReserve:40,contentHeight:160,containScale:.2,containedPageWidth:256};
const damping={tauMs:180,settled95Ms:-Math.log(.05)*180,settled99Ms:-Math.log(.01)*180,observation:'180ms time constant is about540ms to95%, not a180ms completed animation.'};
const result={recordedAt:new Date().toISOString(),type:'RESEARCH_ESTIMATE_NOT_BROWSER_MEASUREMENT',formula:'P * Rx * Ry about center650,380; world units interpreted as CSS px; no host zoom',existing,poses,thumbnails,damping};
fs.writeFileSync('.companion/rhine-research/projection-study.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({existing,poseWidthRatios:poses.map(p=>({pitch:p.pitch,yaw:p.yaw,ratio:p.screenWidthRatio})),thumbnails,damping},null,2));
