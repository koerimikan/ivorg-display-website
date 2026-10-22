// Host-owned adapter: Atelier never imports IVORG business modules itself.
import * as motion from '../src/scripts/motion.js';
import {registerHostMotion} from '@atelier/client/motion';
registerHostMotion(motion);

import {getHomeController} from '../src/scripts/home.js';
const lifetime=new AbortController();
window.addEventListener('dev-studio:mode',event=>{const locked=event.detail==='stage';getHomeController()?.pause(locked);window.dispatchEvent(new CustomEvent('ivorg:input-lock',{detail:{locked}}));},{signal:lifetime.signal});
window.addEventListener('dev-studio:physics',event=>getHomeController()?.configure(event.detail),{signal:lifetime.signal});
window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
if(import.meta.hot)import.meta.hot.dispose(()=>lifetime.abort());
