import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
const error = code => Object.assign(Error(code), {code});

export function retryTimestamp(message, now = Date.now()) {
  const match = /reset in\s+(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?)/i.exec(message) || /retry[- ]after[:\s]+(\d+)\s*(seconds?)?/i.exec(message);
  const delay = match ? Number(match[1]) * (/^h/i.test(match[2]) ? 3600000 : /^m/i.test(match[2]) ? 60000 : 1000) : 30 * 60000;
  return new Date(now + Math.max(1000, delay)).toISOString();
}

async function sleep(ms, signal) {
  if (signal?.aborted) throw error('ABORTED');
  await new Promise((resolve, rejectSleep) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); rejectSleep(error('ABORTED')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function saveState(file, update) {
  await mkdir(path.dirname(file), {recursive:true});
  let prior = {};
  try { prior = JSON.parse(await readFile(file, 'utf8')); } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  const temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify({ ...prior, ...update, updatedAt: new Date().toISOString() }, null, 2));
  await rename(temporary, file);
}

export async function withQuotaRecovery({ run, probe, stateFile, context, signal, probeIntervalMs = 15 * 60000, verifyResume = async () => {} }) {
  let result = await run();
  while (result.status === 'rateLimited') {
    let retryAt = result.retryAtTimestamp || retryTimestamp('');
    await saveState(stateFile, { ...context, waitingForRateLimitReset: true, retryAtTimestamp: retryAt });
    let ready = false;
    while (!ready) {
      await sleep(Math.min(probeIntervalMs, Math.max(1, Date.parse(retryAt) - Date.now())), signal);
      ready = await probe();
      if (!ready) { retryAt = new Date(Date.now() + probeIntervalMs).toISOString(); await saveState(stateFile, { retryAtTimestamp: retryAt }); }
    }
    await verifyResume();
    await saveState(stateFile, { waitingForRateLimitReset: false, retryAtTimestamp: null });
    result = await run();
  }
  return result;
}
