import { gsap } from 'gsap';
export const preferences={motion:!matchMedia('(prefers-reduced-motion: reduce)').matches};
const media=matchMedia('(prefers-reduced-motion: reduce)');
export function setMotion(value){preferences.motion=value;document.documentElement.dataset.motion=value?'on':'off';if(!value)wipe(false);window.dispatchEvent(new Event('ivorg:motion'));}
media.addEventListener('change',()=>setMotion(!media.matches));
let wipeAnimation=null,resolveWipe=null;
const EMPTY='polygon(0% 0%,0% 0%,-18% 100%,-18% 100%)';
const FULL='polygon(0% 0%,118% 0%,100% 100%,0% 100%)';
const OUT='polygon(118% 0%,118% 0%,100% 100%,100% 100%)';
export function wipe(covered){
 if(wipeAnimation){wipeAnimation.kill();wipeAnimation=null;resolveWipe?.();resolveWipe=null;}
 const element=document.getElementById('page-wipe');if(!element)return Promise.resolve();
 if(!preferences.motion){gsap.set(element,{clipPath:covered?FULL:OUT,visibility:'hidden'});return Promise.resolve();}
 element.style.visibility='visible';
 return new Promise(resolve=>{resolveWipe=resolve;wipeAnimation=gsap.fromTo(element,{clipPath:covered?EMPTY:FULL},{clipPath:covered?FULL:OUT,duration:covered?.56:.78,ease:'expo.out',onComplete:()=>{if(!covered)element.style.visibility='hidden';wipeAnimation=null;resolveWipe=null;resolve();}});});
}
export function enterPage(root){
 const frames=new Set(),nodes=[...root.querySelectorAll('[data-decode]')];
 for(const element of nodes){const text=element.dataset.decode;const start=performance.now();
  function decode(now){if(!element.isConnected)return;const p=preferences.motion?Math.min(1,(now-start)/650):1,count=Math.floor((1-(1-p)**4)*text.length),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_';element.textContent=[...text].map((char,i)=>i<count||char===' '?char:alphabet[(i*5+Math.floor((now-start)/40))%alphabet.length]).join('');if(p<1){const id=requestAnimationFrame(time=>{frames.delete(id);decode(time);});frames.add(id);}}
  decode(start);
 }
 const context=gsap.context(()=>{if(!preferences.motion)return;const lines=root.querySelectorAll('.reveal');if(lines.length)gsap.fromTo(lines,{yPercent:110},{yPercent:0,duration:1.1,stagger:.07,ease:'expo.out',clearProps:'transform'});const items=root.querySelectorAll('.feature-poster,.bulletin-poster,.cover-face,.track-row,.index-title,.reader-body>h2,.reader-deck');gsap.fromTo(items,{y:26,opacity:0},{y:0,opacity:1,duration:.95,stagger:.045,ease:'expo.out',clearProps:'transform,opacity'});},root);
 function finish(){frames.forEach(cancelAnimationFrame);frames.clear();nodes.forEach(element=>element.textContent=element.dataset.decode);context.revert();}
 const stop=()=>{if(!preferences.motion)finish();};window.addEventListener('ivorg:motion',stop);
 return()=>{window.removeEventListener('ivorg:motion',stop);finish();};
}
