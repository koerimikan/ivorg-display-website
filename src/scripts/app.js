import { $, el } from '../lib/ui.js';
import { navigate } from 'astro:transitions/client';
import { preferences, setMotion, enterPage, wipe } from './motion.js';
import { mountHome } from './home.js';
import { mountNewsletter } from './newsletter.js';
let cleanPage=null,cleanEntrance=null,observer=null,gridVisible=false,decorationFrame=0,navigationId=0,navigated=false;
// Scroll paging: wheel/trackpad down goes to the next page, up to the previous
// one. Pages taller than the viewport scroll normally until they hit an edge.
const PAGES=['/','/discography/','/newsletter/'];
// Small overflows (a few dozen pixels of ragged content) should still page on
// the first gesture; real long pages keep scrolling until they reach an edge.
const EDGE=96;
// Paging needs a deliberate gesture: ~3 mouse notches inside one scroll, and
// nothing at all for a moment after a page has just landed.
const WHEEL_STEP=300,WHEEL_IDLE=520,ARM_DELAY=700,SWIPE_MIN=110;
let wheelTotal=0,wheelReset=0,navLocked=false,wheelArmUntil=0;
function pageIndex(){const path=location.pathname.replace(/index\.html$/,'');return PAGES.indexOf(path.endsWith('/')?path:path+'/');}
function canStep(direction){const index=pageIndex();const target=index+direction;return index>-1&&target>-1&&target<PAGES.length;}
function atEdge(direction){const top=scrollY<=EDGE,bottom=scrollY+innerHeight>=document.documentElement.scrollHeight-EDGE;return direction>0?bottom:top;}
function stepPage(direction){
 if(navLocked||!canStep(direction))return false;
 navLocked=true;navigate(PAGES[pageIndex()+direction]).catch(()=>{navLocked=false;});return true;
}
window.addEventListener('wheel',event=>{
 if(event.ctrlKey||event.metaKey||event.shiftKey)return;
 if(Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
 const direction=event.deltaY>0?1:-1;
 if(navLocked){event.preventDefault();return;}
 if(performance.now()<wheelArmUntil)return;
 if(!canStep(direction)||!atEdge(direction))return;
 // a direction change starts a fresh count instead of carrying momentum over
 if(Math.sign(wheelTotal)!==direction)wheelTotal=0;
 event.preventDefault();
 clearTimeout(wheelReset);wheelReset=setTimeout(()=>{wheelTotal=0;},WHEEL_IDLE);
 wheelTotal+=event.deltaY;
 if(Math.abs(wheelTotal)>=WHEEL_STEP){wheelTotal=0;stepPage(direction);}
},{passive:false});
let touchStart=null;
window.addEventListener('touchstart',event=>{if(event.touches.length!==1){touchStart=null;return;}const touch=event.touches[0];touchStart={x:touch.clientX,y:touch.clientY};},{passive:true});
window.addEventListener('touchend',event=>{
 const start=touchStart;touchStart=null;if(!start||navLocked||performance.now()<wheelArmUntil)return;
 const touch=event.changedTouches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;
 if(Math.abs(dy)<SWIPE_MIN||Math.abs(dy)<Math.abs(dx)*1.3)return;
 const direction=dy<0?1:-1;
 if(atEdge(direction))stepPage(direction);
},{passive:true});
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
 navLocked=false;wheelTotal=0;wheelArmUntil=performance.now()+ARM_DELAY;
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
