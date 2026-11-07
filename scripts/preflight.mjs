// Pre-flight checks run before dev servers start. Fails closed with an actionable
// message instead of letting Astro silently pick another port or crash later.
// Usage: node scripts/preflight.mjs [--ports 4321,4323] [--agent]
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const ports = (arg('--ports') || '').split(',').filter(Boolean).map(Number);
const checkAgent = args.includes('--agent');
const errors = [], warnings = [];

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) errors.push(`Node.js >=22.19.0 required, found ${process.versions.node}. Install a newer Node or put it first on PATH.`);
if (!existsSync(path.join(root, 'node_modules/astro/package.json'))) errors.push('Dependencies missing. Run `npm ci` in the repository root.');

export function portOwner(port) {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
    const line = out.split(/\r?\n/).find(l => /LISTENING/.test(l) && new RegExp(`[:.]${port}\\s`).test(l));
    return line ? line.trim().split(/\s+/).pop() : null;
  } catch { return null; }
}

export function probePort(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => resolve(error.code === 'EADDRINUSE' || error.code === 'EACCES' ? 'busy' : 'error:' + error.code));
    server.listen(port, host, () => server.close(() => resolve('free')));
  });
}

for (const port of ports) {
  const state = await probePort(port);
  if (state === 'free') continue;
  const pid = portOwner(port);
  errors.push(`Port ${port} is already in use${pid ? ` (PID ${pid})` : ''}. ` +
    `Another dev server (npm run dev vs npm run dev:workbench share 4321) may be running. ` +
    `Check it with \`netstat -ano | findstr :${port}\` and stop it yourself if it belongs to this project; this script never kills processes.`);
}

if (checkAgent) {
  const runtimeFile = path.join(root, 'apps/ivorg-website/.companion/agent/runtime.json');
  const harness = process.env.COMPANION_DSH_ROOT || process.env.DSH_HARNESS_PATH ||
    (existsSync(runtimeFile) ? JSON.parse(readFileSync(runtimeFile, 'utf8')).harnessRoot : '');
  if (!harness) warnings.push('Agent not configured: set DSH_HARNESS_PATH and run `npm run agent:configure`. The workbench UI still works; Agent requests fail closed.');
  else if (!existsSync(harness)) warnings.push(`Configured DeepSeek Harness path does not exist: ${harness}. Re-run \`npm run agent:configure\`.`);
  if (!process.env.DEEPSEEK_API_KEY) warnings.push('DEEPSEEK_API_KEY is not set: live model calls will be refused (fixtures and UI still work).');
}

for (const w of warnings) console.warn('[preflight] WARN ' + w);
if (errors.length) {
  for (const e of errors) console.error('[preflight] FAIL ' + e);
  process.exit(1);
}
console.log('[preflight] OK' + (ports.length ? ` ports ${ports.join(',')} free` : ''));
