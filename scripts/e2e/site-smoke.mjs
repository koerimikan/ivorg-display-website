// Real-browser smoke of the production build served by `astro preview`:
// every route loads with zero console errors and zero failed requests,
// fonts resolve locally, and ClientRouter navigation keeps working.
// Usage: node scripts/e2e/site-smoke.mjs [--out <dir>]   (needs a fresh `npm run build`)
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './cdp.mjs';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(repo, 'verification/release-readiness/site'));
await mkdir(out, { recursive: true });
const { preview } = await import('astro');
const server = await preview({ root: path.join(repo, 'apps/ivorg-website'), logLevel: 'warn', server: { host: '127.0.0.1', port: 4321 } });
const browser = await launchBrowser({ width: 1440, height: 900 });
const result = { routes: {}, pass: true };
try {
  const page = await browser.newPage();
  const errors = [], failed = [], requests = new Set();
  await page.call('Log.enable');
  const collector = message => {
    if (message.sessionId !== page.sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text + ' ' + (message.params.entry.url || ''));
    if (message.method === 'Network.requestWillBeSent') requests.add(message.params.request.url);
    if (message.method === 'Network.loadingFailed' && !message.params.canceled) failed.push(message.params.errorText + ' ' + message.params.requestId);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) failed.push(message.params.response.status + ' ' + message.params.response.url);
  };
  browser.on(collector);
  for (const route of ['/', '/discography/', '/newsletter/']) {
    const before = errors.length, beforeFailed = failed.length;
    await page.goto('http://127.0.0.1:4321' + route);
    await page.waitFor('document.fonts.status==="loaded"', { timeoutMs: 15000 });
    await new Promise(r => setTimeout(r, 1500));
    const facts = JSON.parse(await page.eval(`JSON.stringify({title:document.title,lang:document.documentElement.lang,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).filter((v,i,a)=>a.indexOf(v)===i),overflowX:document.documentElement.scrollWidth>innerWidth+1})`));
    await writeFile(path.join(out, (route === '/' ? 'home' : route.replaceAll('/', '')) + '.png'), await page.screenshot());
    result.routes[route] = { ...facts, consoleErrors: errors.slice(before), failedRequests: failed.slice(beforeFailed) };
  }
  // ClientRouter navigation (no full reload) from discography to newsletter
  await page.goto('http://127.0.0.1:4321/discography/');
  await page.eval(`document.querySelector('a.nav-link[href="/newsletter/"]').click();true`);
  await page.waitFor(`location.pathname==='/newsletter/'&&!!document.querySelector('#reader-body')`, { timeoutMs: 15000 });
  result.clientRouterNavigation = true;
  result.thirdPartyRequests = [...requests].filter(u => !u.startsWith('http://127.0.0.1:4321') && !u.startsWith('data:') && !u.startsWith('about:'));
  for (const r of Object.values(result.routes)) if (r.consoleErrors.length || r.failedRequests.length || r.overflowX) result.pass = false;
  if (result.thirdPartyRequests.length) result.pass = false;
} catch (error) { result.pass = false; result.error = String(error.stack || error); }
finally { await browser.close(); await server.stop(); }
await writeFile(path.join(out, 'site-smoke.json'), JSON.stringify(result, null, 2));
console.log('SITE_SMOKE ' + (result.pass ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(Object.fromEntries(Object.entries(result.routes).map(([k, v]) => [k, { errors: v.consoleErrors.length, failed: v.failedRequests.length, fonts: v.fonts.length }]))));
process.exit(result.pass ? 0 : 1);
