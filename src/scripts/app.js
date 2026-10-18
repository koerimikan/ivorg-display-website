import { $, el } from '../lib/ui.js';
import { preferences, setMotion, enterPage, wipe } from './motion.js';
import { mountHome } from './home.js';
import { mountNewsletter } from './newsletter.js';
let cleanPage=null,cleanEntrance=null,observer=null,gridVisible=false,decorationFrame=0,navigationId=0,navigated=false;
function drawGrid(){
 const layer=$('cross-layer'),inspector=$('inspector');if(!layer||!inspector)return;
 const height=Math.max(document.documentElement.scrollHeight,innerHeight),width=document.documentElement.clientWidth;layer.replaceChildren();inspector.replaceChildren();layer.style.height=height+'px';inspector.style.height=height+'px';const points=new Set();
 document.querySelectorAll('[data-grid]').forEach(element=>{const r=element.getBoundingClientRect();if(!r.width||!r.height)return;const left=r.left+scrollX,top=r.top+scrollY;for(const x of [left,left+r.width])for(const y of [top,top+r.height]){const px=Math.max(0,Math.min(width-5,Math.round(x)-2)),py=Math.max(0,Math.round(y)-2),key=px+','+py;if(points.has(key))continue;points.add(key);const cross=el('i','cross');cross.style.left=px+'px';cross.style.top=py+'px';layer.append(cross);}if(gridVisible){const box=el('div','inspect-box');Object.assign(box.style,{left:left+'px',top:top+'px',width:r.width+'px',height:r.height+'px'});box.append(el('span','inspect-label',`${element.dataset.grid} // ${Math.round(r.width)} × ${Math.round(r.height)}`));inspector.append(box);}});
}
function refreshLayout(){if(!decorationFrame)decorationFrame=requestAnimationFrame(()=>{decorationFrame=0;drawGrid();});}
function syncControls(){
 document.documentElement.dataset.motion=preferences.motion?'on':'off';document.body.toggleAttribute('data-inspect',gridVisible);
 if($('grid-toggle')){$('grid-toggle').setAttribute('aria-pressed',String(gridVisible));$('grid-toggle').setAttribute('aria-label',gridVisible?'Turn grid inspector off':'Turn grid inspector on');$('grid-label').textContent=gridVisible?'ON':'GRID';$('inspector').hidden=!gridVisible;}
 const motionButton=$('motion-toggle');if(motionButton){motionButton.setAttribute('aria-pressed',String(preferences.motion));motionButton.replaceChildren(document.createTextNode('MOTION'),document.createElement('br'),document.createTextNode(preferences.motion?'ON':'OFF'));}
}
const clockFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
function tick(){const clock=$('system-clock');if(clock){const now=new Date();clock.textContent='CHI // '+clockFormat.format(now);clock.dateTime=now.toISOString();}}
setInterval(tick,1000);
function unmount(){cleanPage?.();cleanPage=null;cleanEntrance?.();cleanEntrance=null;observer?.disconnect();observer=null;if(decorationFrame)cancelAnimationFrame(decorationFrame);decorationFrame=0;}
function mount(){
 unmount();syncControls();tick();const root=$('page-content');
 const mounts={home:mountHome,newsletter:mountNewsletter};
 cleanPage=mounts[document.body.dataset.page]?.(root);cleanEntrance=enterPage(root);
 observer=new ResizeObserver(refreshLayout);observer.observe(document.body);refreshLayout();
 if(navigated)wipe(false);
}
// Router owns history, aborted navigation and document replacement; GSAP only owns presentation.
document.addEventListener('astro:before-preparation',event=>{
 const originalLoader=event.loader,token=++navigationId;navigated=true;
 event.loader=async()=>{try{await Promise.all([originalLoader(),wipe(true)]);if((event.signal.aborted||event.defaultPrevented)&&token===navigationId)await wipe(false);}catch(error){if(token===navigationId)await wipe(false);throw error;}};
 event.signal.addEventListener('abort',()=>{if(token===navigationId)wipe(false);},{once:true});
});
document.addEventListener('astro:before-swap',event=>{unmount();event.newDocument.documentElement.dataset.motion=preferences.motion?'on':'off';});
document.addEventListener('astro:page-load',mount);
document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;if(event.target.closest('#grid-toggle')){gridVisible=!gridVisible;syncControls();refreshLayout();}if(event.target.closest('#motion-toggle'))setMotion(!preferences.motion);});
window.addEventListener('ivorg:layout',refreshLayout);window.addEventListener('ivorg:motion',syncControls);window.addEventListener('resize',refreshLayout);window.addEventListener('scroll',refreshLayout,{passive:true});
if(document.fonts)document.fonts.ready.then(refreshLayout);
