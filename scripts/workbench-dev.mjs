import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { createControlServer } from '../src/workbench-server/server.js';
const root = fileURLToPath(new URL('../', import.meta.url));
async function free(port) {
  const probe = net.createServer();
  await new Promise((resolve,reject) => { probe.once('error',reject); probe.listen(port,'127.0.0.1',resolve); });
  await new Promise(resolve=>probe.close(resolve));
}
let control, preview, stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await Promise.allSettled([preview?.stop(), control?.stop()]);
}
try {
  await free(4321); await free(4323);
  process.env.COMPANION_P1 = '1';
  control = await createControlServer({ root, enableWrites: true });
  const { dev } = await import('astro');
  preview = await dev({ root, server: { host:'127.0.0.1', port:4321 }, vite:{ server:{ strictPort:true } } });
  if (preview.address.port !== 4321) throw new Error('Preview must listen on 4321');
  await mkdir(new URL('../.companion/', import.meta.url), { recursive:true });
  await writeFile(new URL('../.companion/runtime.json', import.meta.url), JSON.stringify({ pid:process.pid, control:'http://127.0.0.1:4323', preview:'http://127.0.0.1:4321', sessionId:control.actor.sessionId, stage:'P3', readOnly:false },null,2));
  console.log('WORKBENCH READY control=http://127.0.0.1:4323 preview=http://127.0.0.1:4321 readOnly=false');
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{void stop().finally(()=>process.exit(0));});
} catch(error) { console.error(error.message); await stop(); process.exitCode=1; }
