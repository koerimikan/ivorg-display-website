// Minimal Chrome DevTools Protocol driver for a real headless Chromium
// (Edge or Chrome already installed on the machine). No npm browser package.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [process.env.ATELIER_E2E_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);

export function findBrowser() {
  const found = CANDIDATES.find(file => existsSync(file));
  if (!found) throw new Error('E2E_BROWSER_MISSING: install Edge/Chrome or set ATELIER_E2E_BROWSER');
  return found;
}

export async function launchBrowser({ width = 1440, height = 900 } = {}) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'atelier-e2e-browser-'));
  const child = spawn(findBrowser(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', `--window-size=${width},${height}`, '--force-device-scale-factor=1', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('BROWSER_START_TIMEOUT')), 20000);
    child.stderr.on('data', chunk => { buffer += chunk; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buffer); if (m) { clearTimeout(timer); resolve(m[1]); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('BROWSER_EXITED ' + code)); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1; const pending = new Map(), listeners = [];
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
    else if (message.method) for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const on = listener => { listeners.push(listener); return () => listeners.splice(listeners.indexOf(listener), 1); };

  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Page.enable'); await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const page = {
      sessionId, call,
      async goto(url, { waitMs = 20000 } = {}) {
        const loaded = new Promise(resolve => { const off = on(m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); resolve(); } }); setTimeout(resolve, waitMs); });
        await call('Page.navigate', { url }); await loaded;
      },
      async eval(expression, contextId) {
        const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) });
        if (result.exceptionDetails) throw new Error('EVAL ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
        return result.result.value;
      },
      async waitFor(expression, { timeoutMs = 20000, contextId } = {}) {
        const end = Date.now() + timeoutMs;
        for (;;) { try { const value = await page.eval(expression, contextId); if (value) return value; } catch {} if (Date.now() > end) throw new Error('WAIT_TIMEOUT ' + expression.slice(0, 120)); await new Promise(r => setTimeout(r, 150)); }
      },
      async frameContextOf(selector) {
        const { root } = await call('DOM.getDocument', { depth: 0 });
        const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector });
        if (!nodeId) return null;
        const { node } = await call('DOM.describeNode', { nodeId });
        if (!node.frameId) return null;
        const { executionContextId } = await call('Page.createIsolatedWorld', { frameId: node.frameId, worldName: 'e2e-' + Date.now() });
        return executionContextId;
      },
      async frameContext(urlPrefix) {
        const { frameTree } = await call('Page.getFrameTree');
        const frames = []; (function walk(node) { frames.push(node.frame); (node.childFrames || []).forEach(walk); })(frameTree);
        const frame = frames.find(f => f.url.startsWith(urlPrefix));
        if (!frame) return null;
        const { executionContextId } = await call('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'e2e-' + Date.now() });
        return executionContextId;
      },
      key: (type, { key, code, modifiers = 0, windowsVirtualKeyCode }) => call('Input.dispatchKeyEvent', { type, key, code, modifiers, windowsVirtualKeyCode }),
      mouse: (type, x, y, extra = {}) => call('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra }),
      async screenshot() { return Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'); },
      setCookie: cookie => call('Network.setCookie', cookie)
    };
    await call('Network.enable');
    return page;
  }
  async function close() { try { ws.close(); } catch {} child.kill(); await new Promise(r => setTimeout(r, 300)); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); }
  return { newPage, close, send, on, browserPath: findBrowser() };
}
