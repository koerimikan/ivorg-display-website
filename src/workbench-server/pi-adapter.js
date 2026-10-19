import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { reject } from '../workbench-core/changes/structure.js';

const quotaError = value => /429|quota exceeded|rate limit reached|too many requests|quota exhausted/i.test(value || '');
const error = code => Object.assign(Error(code), { code });

function finalFailure(events) {
  const assistant = events.filter(record => record.type === 'message_end' && record.message?.role === 'assistant').at(-1);
  const lastMessageIndex = assistant ? events.lastIndexOf(assistant) : -1;
  const retryFailure = events.findLastIndex(record => record.type === 'auto_retry_end' && record.success === false);
  if (retryFailure > lastMessageIndex) return events[retryFailure].finalError || 'PI_RETRY_EXHAUSTED';
  if (assistant?.message.errorMessage) return assistant.message.errorMessage;
  if (assistant?.message.stopReason === 'error') return 'PI_PROVIDER_ERROR';
  return '';
}

export class PiAdapter {
  constructor(child, { onEvent = () => {}, maxBadLines = 3, maxLineBytes = 1048576, maxEventBytes = 8 * 1048576 } = {}) {
    this.child = child; this.pending = new Map(); this.listeners = new Set(); this.onEvent = onEvent;
    this.maxBadLines = maxBadLines; this.maxLineBytes = maxLineBytes; this.maxEventBytes = maxEventBytes;
    this.badLines = 0; this.closed = false; this.running = false; this.diagnostics = '';
    child.stderr?.on('data', chunk => { this.diagnostics = (this.diagnostics + chunk.toString()).slice(-4096); });
    child.on('error', () => this.fail('PI_START_FAILED'));
    child.on('exit', () => this.fail('PI_EXIT'));
    this.consumer = this.consume().catch(cause => this.fail(cause.code || 'PROTOCOL_ERROR'));
  }
  fail(code) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error(code)); }
    this.pending.clear();
    for (const listener of this.listeners) listener({ type: 'transport_error', code });
    this.child.stdin.destroy(); this.child.kill();
  }
  async consume() {
    const decoder = new StringDecoder('utf8'); let buffer = '';
    for await (const chunk of this.child.stdout) {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > this.maxLineBytes && !buffer.includes('\n')) { this.fail('PROTOCOL_LINE_LIMIT'); return; }
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).replace(/\r$/, ''); buffer = buffer.slice(at + 1);
        if (!line) continue;
        if (Buffer.byteLength(line) > this.maxLineBytes) { this.fail('PROTOCOL_LINE_LIMIT'); return; }
        let record;
        try { record = JSON.parse(line); if (!record || typeof record.type !== 'string') throw error('PROTOCOL_SHAPE'); }
        catch { if (++this.badLines > this.maxBadLines) { this.fail('PROTOCOL_ERROR'); return; } continue; }
        if (record.type === 'response') {
          const pending = this.pending.get(record.id);
          if (pending) {
            this.pending.delete(record.id); clearTimeout(pending.timer);
            if (record.success) pending.resolve(record.data);
            else pending.reject(Object.assign(Error(String(record.error || 'PI_REJECTED')), { code: 'PI_REJECTED' }));
          }
        }
        for (const listener of this.listeners) listener(record);
        // Await the sink so stdout backpressure remains bounded instead of dropping events.
        await this.onEvent(record);
      }
    }
    buffer += decoder.end();
    if (buffer.trim()) this.fail('PROTOCOL_TRUNCATED');
  }
  command(type, data = {}, timeoutMs = 15000) {
    if (this.closed) return Promise.reject(error('PI_CLOSED'));
    if (this.pending.size >= 128) return Promise.reject(error('PI_COMMAND_LIMIT'));
    const id = randomUUID();
    return new Promise((resolve, rejectCommand) => {
      const timer = setTimeout(() => { this.pending.delete(id); rejectCommand(error('PI_COMMAND_TIMEOUT')); }, timeoutMs);
      this.pending.set(id, { resolve, reject: rejectCommand, timer });
      this.child.stdin.write(JSON.stringify({ id, type, ...data }) + '\n', failure => {
        if (failure) { clearTimeout(timer); this.pending.delete(id); rejectCommand(failure); }
      });
    });
  }
  async prompt(message, { timeoutMs = 120000, signal } = {}) {
    if (this.running) reject('PI_BUSY');
    if (signal?.aborted) return { status: 'aborted', events: [] };
    this.running = true;
    let listener, timer, abortListener, settled = null, capturedBytes = 0;
    const events = [];
    const wait = new Promise(resolve => {
      listener = record => {
        capturedBytes += Buffer.byteLength(JSON.stringify(record));
        if (events.length >= 50000 || capturedBytes > this.maxEventBytes) {
          settled = { type: 'transport_error', code: 'PI_EVENT_LIMIT' }; resolve(settled); this.fail('PI_EVENT_LIMIT'); return;
        }
        events.push(record);
        if (['agent_settled', 'transport_error'].includes(record.type)) { settled = record; resolve(record); }
      };
      this.listeners.add(listener);
    });
    const stop = new Promise(resolve => {
      timer = setTimeout(() => resolve({ type: 'deadline' }), timeoutMs);
      abortListener = () => { void this.command('abort').catch(() => {}); resolve({ type: 'cancel' }); };
      signal?.addEventListener('abort', abortListener, { once: true });
    });
    const finish = async result => {
      if (result.type === 'deadline') { this.fail('PI_TIMEOUT'); throw error('PI_TIMEOUT'); }
      if (result.type === 'cancel') {
        let abortTimer;
        const final = settled || await Promise.race([wait, new Promise(resolve => { abortTimer = setTimeout(() => resolve(null), 2000); })]);
        clearTimeout(abortTimer);
        if (!final) this.fail('PI_ABORT_TIMEOUT');
        return { status: 'aborted', events };
      }
      if (result.type === 'transport_error') throw error(result.code);
      if (result.aborted) return { status: 'aborted', events };
      const failure = finalFailure(events);
      if (quotaError(failure)) return { status: 'rateLimited', retryAtTimestamp: retryTimestamp(failure), events };
      return failure ? { status: 'error', error: failure, events } : { status: 'completed', events };
    };
    try {
      const accepted = await Promise.race([this.command('prompt', { message }).then(data => ({ type: 'accepted', data })), stop]);
      if (accepted.type !== 'accepted') return await finish(accepted);
      if (accepted.data?.disposition === 'handled') return { status: 'handled', events };
      if (!['started', 'queued'].includes(accepted.data?.disposition)) reject('PI_DISPOSITION');
      return await finish(settled || await Promise.race([wait, stop]));
    } catch (failure) {
      if (quotaError(failure.message)) return { status: 'rateLimited', retryAtTimestamp: retryTimestamp(failure.message), events };
      throw failure;
    } finally {
      clearTimeout(timer); this.listeners.delete(listener); signal?.removeEventListener('abort', abortListener); this.running = false;
    }
  }
  async close() {
    if (this.closed) return;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill(), 2000);
    await new Promise(resolve => { if (this.child.exitCode !== null || this.child.signalCode !== null) return resolve(); this.child.once('exit', resolve); });
    clearTimeout(timer);
  }
}

export function retryTimestamp(message, now = Date.now()) {
  const match = /reset in\s+(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?)/i.exec(message) || /retry[- ]after[:\s]+(\d+)\s*(seconds?)?/i.exec(message);
  const delay = match ? Number(match[1]) * (/^h/i.test(match[2]) ? 3600000 : /^m/i.test(match[2]) ? 60000 : 1000) : 30 * 60000;
  return new Date(now + Math.max(1000, delay)).toISOString();
}

export function piEnvironment(source, provider) {
  const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'PI_CODING_AGENT_DIR', 'PI_PACKAGE_DIR', 'PI_OFFLINE']);
  const providerKey = { deepseek: 'DEEPSEEK_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', google: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY' }[provider];
  if (providerKey) allowed.add(providerKey);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
}

export async function startPi({ root, userId, cli, provider, model, onEvent }) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) reject('USER_SCOPE');
  const base = path.join(root, '.companion/pi/users'), directory = path.join(base, userId);
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink() || !(await realpath(directory)).startsWith((await realpath(base)) + path.sep)) reject('USER_SCOPE');
  if (!provider) {
    try { const settings = JSON.parse(await readFile(path.join(process.env.PI_CODING_AGENT_DIR || path.join(homedir(), '.pi/agent'), 'settings.json'), 'utf8')); provider = settings.defaultProvider; model ||= settings.defaultModel; }
    catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  }
  const args = [cli, '--mode', 'rpc', '--session-dir', directory, '--no-tools', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates'];
  if (provider && model) args.push('--provider', provider);
  if (model) args.push('--model', model);
  const child = spawn(process.execPath, args, { cwd: directory, env: piEnvironment(process.env, provider), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  return new PiAdapter(child, { onEvent });
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
