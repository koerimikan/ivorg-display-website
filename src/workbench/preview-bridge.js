import { CONTROL_ORIGIN, isBridgeInit } from '../workbench-core/bridge.js';

// Executed inside the preview; the parent receives data only, never a DOM handle.
const lifetime = new AbortController(); let context = null, revision = null, reading = 0;
const routes = { '/': 'page.home', '/discography/': 'page.discography', '/newsletter/': 'page.newsletter' };
function send(kind, extra) {
  if (!context || !revision) return;
  window.parent.postMessage({ schemaVersion: 1, kind, frameEpoch: context.frameEpoch, sessionNonce: context.sessionNonce, docRevision: revision, ...extra }, CONTROL_ORIGIN);
}
async function sample(kind = 'measure') {
  if (!context) return;
  const epoch = context.frameEpoch, nonce = context.sessionNonce, sequence = ++reading;
  try {
    const response = await fetch('/__companion/preview-state', { cache: 'no-store', signal: lifetime.signal });
    if (!response.ok) return;
    const data = await response.json();
    if (sequence !== reading || context?.frameEpoch !== epoch || context?.sessionNonce !== nonce) return;
    revision = data.docRevision;
    if (kind === 'hello' || kind === 'route') send(kind, { pathname: location.pathname });
    const nodes = [...document.querySelectorAll('main,[data-grid]')].filter(n => n.getBoundingClientRect().width > 0).slice(0, 80);
    send('measure', { pathname: location.pathname, rects: nodes.map(node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; }),
      hitIds: [routes[location.pathname]].filter(Boolean), runtimeSourceIds: [...new Set(nodes.map(n => n.getAttribute('data-ds-id')).filter(Boolean))] });
  } catch { /* disconnected preview is reflected by the control-plane handshake timeout */ }
}
window.addEventListener('message', ev => {
  if (!isBridgeInit(ev, window.parent)) return;
  context = { frameEpoch: ev.data.frameEpoch, sessionNonce: ev.data.sessionNonce }; revision = null;
  void sample('hello');
}, { signal: lifetime.signal });
document.addEventListener('astro:page-load', () => { void sample('route'); }, { signal: lifetime.signal });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { void sample(); }, 100); }, { signal: lifetime.signal });
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => { void sample('route'); });
  import.meta.hot.dispose(() => { clearTimeout(resizeTimer); lifetime.abort(); context = null; });
}
