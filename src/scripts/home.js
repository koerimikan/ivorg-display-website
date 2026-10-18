import { preferences } from './motion.js';
export function mountHome(root){
 const stage=root.querySelector('#home-foci'),stack=root.querySelector('#poster-stack');if(!stage)return()=>{};
 const controller=new AbortController(),{signal}=controller;let x=0,y=0,tx=0,ty=0,last=performance.now(),frameId;
 stage.addEventListener('pointermove',event=>{const r=stage.getBoundingClientRect(),u=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),v=Math.max(0,Math.min(1,(event.clientY-r.top)/r.height));stage.querySelector('[data-coord="tl"]').textContent=`X ${u.toFixed(3)} / Y ${v.toFixed(3)}`;stage.querySelector('[data-coord="tr"]').textContent=`U ${(1-u).toFixed(3)} / V ${(1-v).toFixed(3)}`;stage.querySelector('[data-coord="bl"]').textContent=`ΔX ${(u-.5).toFixed(3)} / ΔY ${(v-.5).toFixed(3)}`;stage.querySelector('[data-coord="br"]').textContent=`NORM / ${u.toFixed(3)} : ${v.toFixed(3)}`;tx=(u-.5)*18;ty=(v-.5)*14;},{signal});
 stage.addEventListener('pointerleave',()=>{tx=ty=0;},{signal});
 function frame(now){const dt=Math.min(64,now-last);last=now;const damping=1-Math.exp(-dt/140);x+=(tx-x)*damping;y+=(ty-y)*damping;stack.style.transform=preferences.motion&&!document.body.hasAttribute('data-inspect')?`translate3d(${x}px,${y}px,0)`:'none';frameId=requestAnimationFrame(frame);}
 frameId=requestAnimationFrame(frame);return()=>{controller.abort();cancelAnimationFrame(frameId);};
}