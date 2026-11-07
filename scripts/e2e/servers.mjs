// Starts the Atelier control plane (4323) and the host's Astro dev preview
// (4321, with the dev-only Bridge) for a given host root. Ports are the
// Bridge's pinned origins; preflight refuses to start if either is taken.
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));

async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', error => reject(new Error(error.code === 'EADDRINUSE' ? `PORT_IN_USE ${port}: stop the other dev server first` : error.message)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

export async function startServers(root) {
  await assertFree(4321); await assertFree(4323);
  process.env.COMPANION_P1 = '1';
  const { createControlServer } = await import('../../packages/atelier/src/workbench-server/server.js');
  const control = await createControlServer({ root, enableWrites: true });
  const { dev } = await import('astro');
  let preview;
  try {
    preview = await dev({ root, logLevel: 'warn', server: { host: '127.0.0.1', port: 4321 }, vite: { server: { strictPort: true, fs: { allow: [root, path.join(repo, 'node_modules')] } } } });
  } catch (error) { await control.stop(); throw error; }
  const credentials = Object.fromEntries((await readFile(path.join(root, '.companion/auth/bootstrap-owner.txt'), 'utf8')).split(/\r?\n/).filter(Boolean).map(line => line.split('=')).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
  return {
    control, preview, credentials,
    controlOrigin: 'http://127.0.0.1:4323', previewOrigin: 'http://127.0.0.1:4321',
    async stop() { await Promise.allSettled([preview.stop(), control.stop()]); }
  };
}
