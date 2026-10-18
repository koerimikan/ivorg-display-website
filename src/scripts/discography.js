import { ALBUMS } from '../lib/data.js';
import { coverSVG } from '../lib/artwork.js';
import { audio } from '../lib/audio.js';
import { $, el, formatTime, notify } from '../lib/ui.js';
let selectedAlbum=0;
export function mountDiscography(root){
 const controller=new AbortController(),{signal}=controller;
 const query=new URLSearchParams(location.search).get('album');
 if(query!==null&&Number.isInteger(Number(query))&&Number(query)>=0&&Number(query)<ALBUMS.length)selectedAlbum=Number(query);
 const run=promise=>Promise.resolve(promise).catch(error=>notify(error.message));
 function syncRows(){root.querySelectorAll('.track-row').forEach(row=>{const active=audio.mode==='synth'&&row.dataset.track===audio.track.id;row.classList.toggle('is-current',active);const button=row.querySelector('button');if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});}
 function renderAlbum(index){
  selectedAlbum=index;const album=ALBUMS[index];
  $('album-cat').textContent='CAT // '+album.id;$('cover-sticker').textContent='SIDE A / '+album.id;$('album-title').textContent=album.title;$('album-cn').textContent=album.cn;$('album-description').textContent=album.description;$('album-cover').innerHTML=coverSVG(index);
  root.querySelectorAll('[data-album]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.album)===index)));
  $('album-specs').replaceChildren();for(const [key,value] of [['RELEASE',album.date],['FORMAT','04 SYNTH PREVIEWS'],['GENRE',album.genre],['EDITION','DEMO / INDEPENDENT']]){const cell=el('div');cell.append(el('span','micro muted',key),el('span','spec-value',value));$('album-specs').append(cell);}
  $('track-body').replaceChildren();album.tracks.forEach((track,i)=>{const row=el('tr','track-row');row.dataset.track=track.id;const num=el('td','',String(i+1).padStart(2,'0')),title=el('td'),button=el('button','track-name',track.title);button.type='button';button.setAttribute('aria-label','试听 '+track.title);title.append(button,el('span','track-sub',track.cn),el('span','mobile-credit',track.producer+' / MUSIC · '+track.lyrics+' / LYRICS · '+track.tuning+' / TUNING'));const vocal=el('td');vocal.append(el('span','track-engine',track.vocal),el('span','track-sub',track.engine));const credit=el('td');for(const text of [track.producer+' / MUSIC',track.lyrics+' / LYRICS',track.tuning+' / TUNING'])credit.append(el('span','credit',text));const timing=el('td');timing.append(el('span','track-timing',String(track.bpm)),el('span','track-timing muted',formatTime(track.seconds)));row.append(num,title,vocal,credit,timing);$('track-body').append(row);});
  syncRows();window.dispatchEvent(new Event('ivorg:layout'));
 }
 let lastCover='';
 function syncDeck(){
  $('play-button').textContent=audio.playing?'Ⅱ':'▶';$('play-button').setAttribute('aria-pressed',String(audio.playing));$('play-button').setAttribute('aria-label',audio.playing?'暂停当前曲目':'播放当前曲目');
  const cover=audio.mode==='local'?'local':String(audio.track.albumIndex);
  if(cover!==lastCover){if(cover==='local')$('deck-cover').replaceChildren(el('span','micro','↳'));else $('deck-cover').innerHTML=coverSVG(audio.track.albumIndex);lastCover=cover;}
  $('deck-track-name').textContent=audio.mode==='local'?audio.localName:audio.track.title+' / '+audio.track.cn;
  $('deck-credit').textContent=audio.mode==='local'?'LOCAL AUDIO / SESSION ONLY':ALBUMS[audio.track.albumIndex].id+' / SYNTH PREVIEW';
  $('bpm').replaceChildren(el('span','',audio.mode==='local'?'—':String(audio.track.bpm)),el('small','',audio.mode==='local'?'LOCAL':'BPM'));
  $('duration').textContent=formatTime(audio.duration());$('volume').value=audio.volume;$('mute-button').setAttribute('aria-pressed',String(audio.muted));$('mute-button').setAttribute('aria-label',audio.muted?'取消静音':'静音');$('mute-button').textContent=audio.muted?'×':'◖';syncRows();
 }
 root.addEventListener('click',event=>{const album=event.target.closest('[data-album]');if(album){renderAlbum(Number(album.dataset.album));return;}const row=event.target.closest('[data-track]');if(row){run(audio.select(row.dataset.track));return;}},{signal});
 $('play-album').addEventListener('click',()=>run(audio.select(ALBUMS[selectedAlbum].tracks[0].id)),{signal});
 $('play-button').addEventListener('click',()=>run(audio.toggle()),{signal});$('previous-track').addEventListener('click',()=>run(audio.next(-1)),{signal});$('next-track').addEventListener('click',()=>run(audio.next(1)),{signal});
 $('seek').addEventListener('input',event=>run(audio.seek(Number(event.target.value)/1000)),{signal});
 $('volume').addEventListener('input',event=>audio.setVolume(Number(event.target.value),false),{signal});$('mute-button').addEventListener('click',()=>audio.setVolume(audio.volume,!audio.muted),{signal});
 $('local-audio').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)run(audio.loadLocal(file).then(()=>notify('本地音频已挂载，仅保存在本次会话。')));},{signal});
 audio.addEventListener('change',syncDeck,{signal});
 const canvas=$('spectrum'),ctx=canvas.getContext('2d'),levels=new Float32Array(36);let width=0,height=0,frameId=0,lastFrame=0,advancing=false;
 function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
 const observer=new ResizeObserver(resize);observer.observe(canvas.parentElement);resize();
 function frame(now){
  if(now-lastFrame>=35){lastFrame=now;const position=audio.position(),duration=audio.duration();$('elapsed').textContent=formatTime(Math.min(position,duration));$('seek').value=duration?String(Math.min(1000,position/duration*1000)):'0';
   if(audio.playing&&audio.mode==='synth'&&position>=duration&&!advancing){advancing=true;run(audio.next(1,true).finally(()=>advancing=false));}
   const frequency=audio.spectrum(),motion=document.documentElement.dataset.motion!=='off';ctx.clearRect(0,0,width,height);const gap=2,barWidth=Math.max(1,(width-gap*35)/36);for(let i=0;i<36;i++){const bin=Math.floor(2+(i/35)**1.8*190),value=audio.playing&&frequency?frequency[bin]/255:0;levels[i]+=(value-levels[i])*.38;const h=motion?Math.max(2,levels[i]*height):2;ctx.fillStyle=i>28?'#00F0FF':'#E5FF00';ctx.fillRect(i*(barWidth+gap),(height-h)/2,barWidth,h);}
  }frameId=requestAnimationFrame(frame);
 }
 renderAlbum(selectedAlbum);syncDeck();frameId=requestAnimationFrame(frame);
 return()=>{controller.abort();observer.disconnect();cancelAnimationFrame(frameId);audio.leavePage();};
}