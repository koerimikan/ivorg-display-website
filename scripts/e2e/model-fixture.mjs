// OpenAI/DeepSeek-compatible streaming endpoint used when DEEPSEEK_API_KEY is
// absent. It is NOT a model: it derives a schema-valid answer only from the
// context Atelier itself put in the prompt (targets, evidence, snippets), so
// the run exercises the real Harness SDK, Cordis loop, provider wire format,
// Atelier validation and the change pipeline. Every exchange is recorded.
import { createServer } from 'node:http';

function promptContext(body) {
  const messages = body.messages || [];
  const user = [...messages].reverse().find(m => m.role === 'user');
  const content = typeof user?.content === 'string' ? user.content : (user?.content || []).map(part => part.text || '').join('');
  const start = content.lastIndexOf('\n{');
  if (start < 0) return null;
  try { return JSON.parse(content.slice(start + 1)); } catch { return null; }
}

function currentClass(context, target) {
  const lineNo = Number(String(target.evidence).split(':').pop());
  for (const snippet of context.sourceSnippets || []) {
    if (snippet.file !== target.file || !snippet.code) continue;
    const lines = snippet.code.split('\n'), index = lineNo - snippet.startLine;
    const m = /class="([^"]*)"/.exec(lines[index] ?? '');
    if (m) return m[1];
  }
  const nodes = context.capture?.domSummary?.nodes || [];
  return nodes[0]?.attrs?.class ?? null;
}

export function answer(body) {
  const request = promptContext(body);
  if (!request) return { ok: true };
  const { capability, intent, context } = request;
  const boundary = /\[boundary:([a-z]+)\]/.exec(intent)?.[1];
  if (boundary === 'malformed') return 'Sure! Here is my analysis of the selected region, written as prose instead of JSON.';
  if (boundary === 'evidence') return { capability, summary: 'Grounded in a file that was never supplied.', evidence: ['src/pages/invented.astro:1'] };
  if (boundary === 'schema' && capability === 'modify') { const t = context.targets[0]; return { capability, ops: [], clarifications: ['x'], evidence: [t.evidence], patch: '--- a/src/pages/discography.astro' }; }
  if (boundary === 'stale' && capability === 'modify') { const t = context.targets[0]; return { capability, ops: [{ type: 'replaceAttrLiteral', file: t.file, anchor: t.anchor, expectedRevision: '0'.repeat(64), name: 'class', value: 'x' }], clarifications: [], evidence: [t.evidence] }; }
  const evidence = context.targets?.[0]?.evidence || context.evidence?.[0];
  if (capability !== 'modify') {
    const target = context.targets?.[0];
    return { capability, summary: `Fixture ${capability}: the selection maps to ${target ? `${target.file} (${target.evidence})` : context.target?.objectId}. Intent: ${intent.slice(0, 200)}`, evidence: [evidence] };
  }
  const target = context.targets?.[0];
  const wanted = /class "([\w-]+)"/.exec(intent)?.[1];
  if (!target || !wanted) return { capability: 'modify', ops: [], clarifications: ['Which element and class should change?'], evidence: [context.evidence[0]] };
  const existing = currentClass(context, target);
  if (existing === null) return { capability: 'modify', ops: [], clarifications: ['The current class list of the target is not in the supplied context.'], evidence: [target.evidence] };
  const value = [...new Set([...existing.split(/\s+/).filter(Boolean), wanted])].join(' ');
  return { capability: 'modify', ops: [{ type: 'replaceAttrLiteral', file: target.file, anchor: target.anchor, expectedRevision: target.expectedRevision, name: 'class', value, ...(target.objectId ? { objectId: target.objectId } : {}) }], clarifications: [], evidence: [target.evidence] };
}

export async function startModelFixture() {
  const transcript = [], rateLimited = new Set();
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      const request = promptContext(body), marker = /\[boundary:rate\]/.test(request?.intent || '') ? request.intent : null;
      if (marker && !rateLimited.has(marker)) {
        rateLimited.add(marker);
        transcript.push({ at: new Date().toISOString(), path: req.url, model: body.model, tools: Array.isArray(body.tools) ? body.tools.length : 0, request, response: { httpStatus: 429, retryAfter: 2 } });
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '2' });
        res.end(JSON.stringify({ error: { message: 'rate limit reached', type: 'rate_limit_error' } }));
        return;
      }
      const reply = answer(body), text = typeof reply === 'string' ? reply : JSON.stringify(reply);
      transcript.push({ at: new Date().toISOString(), path: req.url, model: body.model, tools: Array.isArray(body.tools) ? body.tools.length : 0, request: promptContext(body), response: reply });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const record of [{ choices: [{ delta: { role: 'assistant', content: null, reasoning_content: '' } }] }, { choices: [{ delta: { content: text } }] }, { choices: [{ delta: { content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: Math.ceil(raw.length / 4), completion_tokens: Math.ceil(text.length / 4) } }])
        res.write('data: ' + JSON.stringify(record) + '\n\n');
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, transcript, close: () => new Promise(resolve => server.close(resolve)) };
}
