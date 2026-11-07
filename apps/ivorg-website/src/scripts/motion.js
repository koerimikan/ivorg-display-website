import { gsap } from 'gsap';
export const preferences={motion:!matchMedia('(prefers-reduced-motion: reduce)').matches};
const media=matchMedia('(prefers-reduced-motion: reduce)');
export function setMotion(value){preferences.motion=value;document.documentElement.dataset.motion=value?'on':'off';if(!value)wipe(false);else warmPosters();window.dispatchEvent(new Event('ivorg:motion'));}
media.addEventListener('change',()=>setMotion(!media.matches));
let wipeAnimation=null,resolveWipe=null,posterBag=[],lastPoster=-1;const warmedPosters=new Map();/* Fetch and decode the wipe deck before the first navigation; Image objects stay referenced so decoded bitmaps are reused. */export function warmPosters(element=document.getElementById('page-wipe')){if(!element||!preferences.motion||navigator.connection?.saveData)return;let list=[];try{list=JSON.parse(element.dataset.posters||'[]');}catch(error){list=[];}for(const {src} of list){if(typeof src!=='string'||warmedPosters.has(src))continue;const image=new Image();image.decoding='async';image.src=src;warmedPosters.set(src,image);image.decode?.().catch(()=>{});}}
// Shuffle a deck of posters and deal one per navigation: every poster is used
// once before any repeats, and a new deck never opens with the previous card.
function nextPoster(count){
 if(!count)return 0;
 if(!posterBag.length){
  posterBag=Array.from({length:count},(value,index)=>index);
  for(let i=posterBag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[posterBag[i],posterBag[j]]=[posterBag[j],posterBag[i]];}
  if(posterBag.length>1&&posterBag[0]===lastPoster)[posterBag[0],posterBag[1]]=[posterBag[1],posterBag[0]];
 }
 lastPoster=posterBag.shift();return lastPoster;
}
export function pickPoster(element){
 const layer=element.querySelector('.wipe-strips i');if(!layer)return;
 let posters=[];try{posters=JSON.parse(element.dataset.posters||'[]');}catch(error){posters=[];}
 if(!posters.length)return;
 const picked=posters[nextPoster(posters.length)];
 // Use a single poster impression without an offset duplicate.
 const [originX,originY]=String(picked.origin||'36% 27%').split(' ');
 layer.style.backgroundImage=`url('${picked.src}')`;
 layer.style.setProperty('--wipe-x',originX);
 layer.style.setProperty('--wipe-y',originY||'27%');
 layer.style.transformOrigin=`${originX} ${originY||'27%'}`;
 // the sheet gradients into the poster's own ink colour (kill switch: data-wipe-tint)
 if(picked.ink)element.style.setProperty('--wipe-ink',picked.ink);
}
const EMPTY='polygon(0% 0%,0% 0%,-18% 100%,-18% 100%)';
const FULL='polygon(0% 0%,118% 0%,100% 100%,0% 100%)';
const OUT='polygon(118% 0%,118% 0%,100% 100%,100% 100%)';
// Shared scene factory: Studio advances this only while recording, never while replaying.
export function createWipeTimeline(element, covered, { paused = false, immediateRender = true } = {}) {
 const strips=element.querySelector('.wipe-strips'),copy=element.querySelector('.wipe-copy');
 const timeline=gsap.timeline({paused});
 timeline.fromTo(element,{clipPath:covered?EMPTY:FULL},{clipPath:covered?FULL:OUT,duration:covered?.56:.78,ease:'expo.out',immediateRender},0);
 if(strips)timeline.fromTo(strips,{xPercent:covered?8:-8},{xPercent:0,duration:covered?.85:.6,ease:'expo.out',immediateRender},0);
 if(copy)timeline.fromTo(copy,{yPercent:covered?16:0,opacity:covered?0:1},{yPercent:0,opacity:1,duration:covered?.55:.3,ease:'expo.out',immediateRender},.04);
 return timeline;
}
export function stopLiveWipe(){
 if(wipeAnimation){wipeAnimation.kill();wipeAnimation=null;resolveWipe?.();resolveWipe=null;}
 const element=document.getElementById('page-wipe');if(!element)return;
 gsap.set(element,{clipPath:OUT,visibility:'hidden'});
 const strips=element.querySelector('.wipe-strips'),copy=element.querySelector('.wipe-copy');
 if(strips)gsap.set(strips,{xPercent:0});if(copy)gsap.set(copy,{yPercent:0,opacity:1});
}
export function wipe(covered){
 if(wipeAnimation){wipeAnimation.kill();wipeAnimation=null;resolveWipe?.();resolveWipe=null;}
 const element=document.getElementById('page-wipe');if(!element)return Promise.resolve();
 const strips=element.querySelector('.wipe-strips'),copy=element.querySelector('.wipe-copy');
 if(covered)pickPoster(element);
 if(!preferences.motion){gsap.set(element,{clipPath:covered?FULL:OUT,visibility:'hidden'});if(strips)gsap.set(strips,{xPercent:0});if(copy)gsap.set(copy,{yPercent:0,opacity:1});return Promise.resolve();}
 element.style.visibility='visible';
 return new Promise(resolve=>{
  const finish=()=>{if(!covered)element.style.visibility='hidden';wipeAnimation=null;resolveWipe=null;resolve();};
  const timeline=createWipeTimeline(element,covered);
  timeline.eventCallback('onComplete',finish);
  wipeAnimation=timeline;resolveWipe=resolve;
 });
}
export function createEntranceTimeline(root, { paused = false, clear = true } = {}) {
 const timeline=gsap.timeline({paused});
 const lines=root.querySelectorAll('.reveal');
 if(lines.length)timeline.fromTo(lines,{yPercent:110},{yPercent:0,duration:1.1,stagger:.07,ease:'expo.out',...(clear?{clearProps:'transform'}:{})},0);
 const items=root.querySelectorAll('.feature-poster,.bulletin-poster,.cover-face,.track-row,.index-title,.reader-body>h2,.reader-deck');
 if(items.length)timeline.fromTo(items,{y:26,opacity:0},{y:0,opacity:1,duration:.95,stagger:.045,ease:'expo.out',...(clear?{clearProps:'transform,opacity'}:{})},0);
 return timeline;
}

export function createDecodeDriver(root, { random = false } = {}) {
 const nodes=[...root.querySelectorAll('[data-decode]')];
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_';
 return {
  advance(elapsedMs){
   const p=Math.max(0,Math.min(1,elapsedMs/650));
   for(const element of nodes){
    const chars=[...element.dataset.decode],count=Math.floor((1-(1-p)**4)*chars.length);
    element.textContent=chars.map((char,i)=>i<count||char===' '?char:alphabet[random?Math.floor(Math.random()*alphabet.length):(i*5+Math.floor(elapsedMs/40))%alphabet.length]).join('');
   }
  },
  finish(){nodes.forEach(element=>element.textContent=element.dataset.decode);}
 };
}

let liveEntranceCleanup=null;
export function stopLiveEntrance(){liveEntranceCleanup?.();}
export function enterPage(root){
 stopLiveEntrance();
 const decoder=createDecodeDriver(root),start=performance.now();
 let frameId=0,finished=false;
 const context=gsap.context(()=>{if(preferences.motion)createEntranceTimeline(root);},root);
 function tick(now){
  if(finished)return;
  const elapsed=preferences.motion?now-start:650;decoder.advance(elapsed);
  if(elapsed<650)frameId=requestAnimationFrame(tick);
 }
 tick(start);
 function finish(){
  if(finished)return;finished=true;cancelAnimationFrame(frameId);decoder.finish();context.revert();
  window.removeEventListener('ivorg:motion',stop);
  if(liveEntranceCleanup===finish)liveEntranceCleanup=null;
 }
 const stop=()=>{if(!preferences.motion)finish();};
 window.addEventListener('ivorg:motion',stop);liveEntranceCleanup=finish;
 return finish;
}
