import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import MagicString from 'magic-string';
import { analyzeSource, patchSource, revision, SourceError } from './source-engine.js';
import { createTaskService } from './task-service.js';
import { TaskError } from './task-proposal.js';

const fail = (status, message) => { throw new SourceError(status, message); };
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

export function createSourceService({ root, onWrite = () => {} }) {
  root = path.resolve(root);
  const records = new Map(), files = new Map(), history = new Map();
  let queue = Promise.resolve(), lastTransaction = null, lastOutcome = null;
  const serial = fn => {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  };
  function publish(result, relative) {
    for (const id of files.get(relative) || []) records.delete(id);
    const ids = [];
    for (const record of result.records) { records.set(record.sourceId, record); ids.push(record.sourceId); }
    files.set(relative, ids);
    return result;
  }
  function register(source, relative) { return publish(analyzeSource(source, relative), relative); }
  async function safeFile(relative, contextOnly = false) {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..') || !relative.startsWith('src/') || !(contextOnly ? /\.(astro|js|css)$/.test(relative) : relative.endsWith('.astro'))) fail(403, 'File outside editable source boundary');
    const requested = path.resolve(root, relative);
    const actualRoot = await realpath(root);
    const actualSrc = await realpath(path.join(root, 'src'));
    if (!inside(actualRoot, actualSrc)) fail(403, 'Source root escapes workspace');
    const actual = await realpath(requested);
    if (!inside(actualSrc, actual) || !inside(actualRoot, actual)) fail(403, 'Symlink escapes editable source boundary');
    if (!(await stat(actual)).isFile()) fail(403, 'Target is not a regular file');
    return actual;
  }
  async function lookup(sourceId) {
    if (typeof sourceId !== 'string' || !/^s_[a-f0-9]{12,64}$/.test(sourceId)) fail(400, 'Invalid sourceId');
    const record = records.get(sourceId);
    if (!record) fail(409, 'Source mapping expired; wait for HMR and select again');
    const filename = await safeFile(record.file);
    const source = await readFile(filename, 'utf8');
    return { record, filename, source };
  }
  async function atomicWrite(filename, relative, expected, next) {
    const temporary = `${filename}.${randomBytes(8).toString('hex')}.ds-tmp`;
    try {
      const mode = (await stat(filename)).mode;
      await writeFile(temporary, next, { encoding: 'utf8', flag: 'wx', mode });
      // Recheck immediately before replacement, in addition to transaction entry validation.
      if (await safeFile(relative) !== filename || revision(await readFile(filename, 'utf8')) !== expected) fail(409, 'File changed while preparing patch');
      await rename(temporary, filename);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  function validateRevision(value) {
    if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail(400, 'Invalid baseRevision');
  }
  const tasks=createTaskService({root,lookup,readContextFile:async file=>readFile(await safeFile(file,true),'utf8')});
  return {
    register,
    context:tasks.context,proposal:tasks.proposal,exportTask:tasks.exportTask,
    get lastTransaction() { return lastTransaction; },
    get lastOutcome() { return lastOutcome; },
    async resolve(sourceId) {
      const { record, source } = await lookup(sourceId);
      if (revision(source) !== record.baseRevision) fail(409, 'Source changed; wait for HMR and select again');
      return record;
    },
    commit(body) {
      return serial(async () => {
        validateRevision(body?.baseRevision);
        const { record, filename, source } = await lookup(body.sourceId);
        const current = revision(source);
        if (current !== body.baseRevision || record.baseRevision !== body.baseRevision) fail(409, 'Revision conflict; select again');
        const result = patchSource(source, record, body.operation);
        if (result.code === source) fail(422, 'No source change');
        const prepared = analyzeSource(result.code, record.file);
        const newRevision = revision(result.code);
        const transactionId = `tx_${randomBytes(16).toString('hex')}`;
        await atomicWrite(filename, record.file, current, result.code);
        history.set(transactionId, { file: record.file, beforeRevision: current, afterRevision: newRevision, patch: result.patch });
        while (history.size > 100) history.delete(history.keys().next().value);
        lastTransaction = { transactionId, newRevision };
        lastOutcome = { kind: 'commit', transactionId, newRevision };
        publish(prepared, record.file);
        // Disk writes are observed by Astro/Vite's normal watcher. This event is informational.
        try { onWrite({ file: record.file, transactionId, newRevision }); } catch { /* Notification cannot fail an already committed transaction. */ }
        return { ok: true, transactionId, newRevision, patch: result.patch };
      });
    },
    undo(body) {
      return serial(async () => {
        if (typeof body?.transactionId !== 'string') fail(400, 'transactionId required');
        const transaction = history.get(body.transactionId);
        if (!transaction) fail(409, 'Undo expired or already applied');
        const filename = await safeFile(transaction.file);
        const source = await readFile(filename, 'utf8');
        if (revision(source) !== transaction.afterRevision) fail(409, 'Undo conflict: file changed since commit');
        const { start, before, after } = transaction.patch;
        if (source.slice(start, start + after.length) !== after) fail(409, 'Undo patch no longer matches');
        const edit = new MagicString(source);
        if (after.length) edit.overwrite(start, start + after.length, before);
        else edit.appendLeft(start, before);
        const code = edit.toString();
        if (revision(code) !== transaction.beforeRevision) fail(409, 'Undo did not reconstruct original revision');
        const prepared = analyzeSource(code, transaction.file);
        await atomicWrite(filename, transaction.file, transaction.afterRevision, code);
        history.delete(body.transactionId);
        if (lastTransaction?.transactionId === body.transactionId) lastTransaction = null;
        lastOutcome = { kind: 'undo', transactionId: body.transactionId, newRevision: transaction.beforeRevision };
        publish(prepared, transaction.file);
        try { onWrite({ file: transaction.file, newRevision: transaction.beforeRevision }); } catch { /* Informational only. */ }
        return { ok: true, newRevision: transaction.beforeRevision };
      });
    }
  };
}

function localHost(hostname) {
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname.toLowerCase());
}
function localPeer(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}
function jsonBody(req, limit = 32768) {
  return new Promise((resolve, reject) => {
    let chunks = [], bytes = 0, tooLarge = false;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > limit) { tooLarge = true; chunks = []; }
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new SourceError(413, 'Request body too large'));
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'JSON object required');
        resolve(value);
      } catch (error) { reject(error instanceof SourceError ? error : new SourceError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new SourceError(400, 'Request aborted')));
  });
}

export function createRpcMiddleware(service) {
  const token = randomBytes(32).toString('hex');
  return async (req, res, next) => {
    if (!req.url?.startsWith('/__dev_studio_api/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const host = req.headers.host;
      let origin;
      try { origin = new URL(req.headers.origin); } catch { fail(403, 'Local Origin required'); }
      if (!host || !localHost(origin.hostname) || origin.protocol !== 'http:' || origin.host !== host || !localPeer(req.socket.remoteAddress)) fail(403, 'Only same-origin loopback requests are allowed');
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site request rejected');
      if (req.method !== 'POST') fail(405, 'POST required');
      if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) fail(415, 'application/json required');
      const route = req.url;
      if (!['/__dev_studio_api/session', '/__dev_studio_api/resolve', '/__dev_studio_api/commit', '/__dev_studio_api/undo', '/__dev_studio_api/context', '/__dev_studio_api/proposal', '/__dev_studio_api/export-task'].includes(route)) fail(404, 'Unknown Studio route');
      if (route !== '/__dev_studio_api/session') {
        const provided = req.headers['x-dev-studio-token'];
        if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/.test(provided) || !timingSafeEqual(Buffer.from(provided), Buffer.from(token))) fail(401, 'Studio session token required');
      }
      const body = await jsonBody(req, route.endsWith('/context') ? 196608 : 32768);
      const result = route.endsWith('/session') ? { token, ...service.lastTransaction, outcome: service.lastOutcome }
        : route.endsWith('/resolve') ? await service.resolve(body.sourceId)
        : route.endsWith('/commit') ? await service.commit(body)
        : route.endsWith('/context') ? await service.context(body)
        : route.endsWith('/proposal') ? await service.proposal(body)
        : route.endsWith('/export-task') ? await service.exportTask(body)
        : await service.undo(body);
      res.statusCode = 200; res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof SourceError || error instanceof TaskError ? error.status : 500;
      res.end(JSON.stringify({ error: error instanceof SourceError || error instanceof TaskError ? error.message : 'Studio operation failed' }));
    }
  };
}
