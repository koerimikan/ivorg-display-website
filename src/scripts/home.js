import { preferences } from './motion.js';
export function mountHome(root){
 const stage=root.querySelector('#home-foci'),stack=root.querySelector('#poster-stack');if(!stage)return()=>{};
 const controller=new AbortController(),{signal}=controller;let x=0,y=0,tx=0,ty=0,last=performance.now(),frameId;
 let frozen=false,factor=1,tau=140,orbit=false;
 // The card you last touched stays in front after the pointer leaves; only
 // hovering swaps the stacking order, it never resets it.
 const frontKey=poster=>poster.classList.contains('feature-poster')?'feature':'bulletin';
 stack.addEventListener('pointerover',event=>{if(!(event.target instanceof Element))return;const poster=event.target.closest('.feature-poster,.bulletin-poster');if(!poster)return;stack.dataset.front=frontKey(poster);},{signal});
 stack.addEventListener('focusin',event=>{if(!(event.target instanceof Element))return;const poster=event.target.closest('.feature-poster,.bulletin-poster');if(!poster)return;stack.dataset.front=frontKey(poster);},{signal});
 function point(u,v){stage.querySelector('[data-coord="tl"]').textContent=`X ${u.toFixed(3)} / Y ${v.toFixed(3)}`;stage.querySelector('[data-coord="tr"]').textContent=`U ${(1-u).toFixed(3)} / V ${(1-v).toFixed(3)}`;stage.querySelector('[data-coord="bl"]').textContent=`ΔX ${(u-.5).toFixed(3)} / ΔY ${(v-.5).toFixed(3)}`;stage.querySelector('[data-coord="br"]').textContent=`NORM / ${u.toFixed(3)} : ${v.toFixed(3)}`;tx=(u-.5)*18*factor;ty=(v-.5)*14*factor;}
 function pointer(event){if(frozen||orbit)return;const r=stage.getBoundingClientRect();point(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height)));}
 stage.addEventListener('pointermove',pointer,{signal});
 stage.addEventListener('pointerleave',()=>{tx=ty=0;},{signal});
 function frame(now){if(frozen)return;const dt=Math.min(64,now-last);last=now;if(orbit)point(.5+.45*Math.sin(now/1300),.5+.45*Math.sin(now/650));const damping=1-Math.exp(-dt/tau);x+=(tx-x)*damping;y+=(ty-y)*damping;stack.style.transform=preferences.motion&&!document.body.hasAttribute('data-inspect')?`translate3d(${x}px,${y}px,0)`:'none';frameId=requestAnimationFrame(frame);}
 if(import.meta.env.DEV){
  window.addEventListener('dev-studio:mode',event=>{
   const nextFrozen=event.detail==='stage';if(nextFrozen===frozen)return;
   frozen=nextFrozen;cancelAnimationFrame(frameId);x=y=tx=ty=0;stack.style.transform='none';
   stage.removeEventListener('pointermove',pointer);
   if(!frozen){last=performance.now();stage.addEventListener('pointermove',pointer,{signal});frameId=requestAnimationFrame(frame);}
  },{signal});
  window.addEventListener('dev-studio:physics',event=>{
   const next=event.detail;
   if(Number.isFinite(next.factor))factor=Math.max(0,Math.min(3,next.factor));
   if(Number.isFinite(next.tau))tau=Math.max(20,Math.min(600,next.tau));
   if(typeof next.orbit==='boolean')orbit=next.orbit;
   tx=ty=0;
  },{signal});
 }
 frameId=requestAnimationFrame(frame);return()=>{controller.abort();cancelAnimationFrame(frameId);};
}
