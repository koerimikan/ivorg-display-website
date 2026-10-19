// Pure data functions. Estimate conservatively by UTF-8 bytes, without claiming a model tokenizer.
export class TaskError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const estimateTokens = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value, null, 2)).length;
const text = (value, length = 160) => typeof value === 'string' ? value.slice(0, length) : '';
const validId = value => typeof value === 'string' && /^s_[a-f0-9]{12,64}$/.test(value);
const validFile = value => typeof value === 'string' && value.startsWith('src/') && !value.includes('\\') && !value.split('/').includes('..') && value.length <= 200;
const STYLE_KEYS = new Set(['display','position','grid-template-columns','grid-template-rows','grid-auto-flow','flex-direction','flex-wrap','justify-content','align-items','width','height','gap','row-gap','column-gap','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','font-family','font-size','font-weight','line-height','letter-spacing','transform','clip-path','z-index','opacity','overflow','mask-image','filter','mix-blend-mode']);

export function sanitizeSnapshot(snapshot) {
  if (!snapshot || !snapshot.domSummary || !Array.isArray(snapshot.domSummary.nodes)) throw new TaskError(422, 'DOM snapshot required');
  if (estimateTokens(snapshot) > 180000) throw new TaskError(413, 'Snapshot too large');
  let count = 0, truncated = Boolean(snapshot.domSummary.truncated);
  const nodeIds = new Set();
  function node(input, depth) {
    if (!input || depth > 6 || count >= 80) { truncated = true; return null; }
    if (typeof input.tag !== 'string' || !/^[a-z][a-z0-9-]*$/.test(input.tag) || ['script','style','input','textarea','html','head','body'].includes(input.tag)) return null;
    if(!/^n\d+$/.test(input.id)||nodeIds.has(input.id))throw new TaskError(422,'DOM node IDs must be unique');
    const id=input.id;
    nodeIds.add(id); count++;
    const output = { id, tag: input.tag, classes: Array.isArray(input.classes) ? input.classes.slice(0,8).map(value => text(value,64)) : [], sourceId: validId(input.sourceId) ? input.sourceId : null };
    if (input.text) output.text = text(input.text);
    if (input.repeat && Number.isInteger(input.repeat.count) && input.repeat.count > 1) {
      const items = Array.isArray(input.repeat.items) ? input.repeat.items.slice(0,24).map(item => text(item,120)) : [];
      output.repeat = { count: Math.min(100000, input.repeat.count), representative: id, items, omittedItems: Math.max(0,input.repeat.count-items.length) };
    }
    if (Array.isArray(input.children)) {
      output.children = [];
      for (const child of input.children) { const result = node(child, depth+1); if (result) output.children.push(result); }
      if (!output.children.length) delete output.children;
    }
    return output;
  }
  const nodes = snapshot.domSummary.nodes.slice(0,8).map(input => node(input,1)).filter(Boolean);
  if (!nodes.length) throw new TaskError(422, 'EMPTY SELECTION: no exportable DOM roots');
  const styles = {};
  for (const [id, properties] of Object.entries(snapshot.styles || {})) {
    if (!nodeIds.has(id) || !properties || typeof properties !== 'object') continue;
    const filtered = {};
    for (const [key,value] of Object.entries(properties)) {
      if (Object.keys(filtered).length >= 23) break;
      if (STYLE_KEYS.has(key) && typeof value === 'string' && value.length && !['none','normal','auto','0px'].includes(value)) filtered[key] = text(value);
    }
    if (properties.variables && typeof properties.variables === 'object') {
      const variables = Object.fromEntries(Object.entries(properties.variables).filter(([key,value]) => /^--[\w-]+$/.test(key) && typeof value === 'string').slice(0,8).map(([key,value]) => [key,text(value,128)]));
      if (Object.keys(variables).length) filtered.variables = variables;
    }
    if (Object.keys(filtered).length) styles[id] = filtered;
  }
  const sourceIds = [...new Set((snapshot.sourceIds || []).filter(validId))].slice(0,24);
  return { domSummary: { nodes, nodeCount: count, truncated }, styles, sourceIds, unmapped: !sourceIds.length };
}

export function taskMarkdown(task) {
  return `# Dev-Studio Task Proposal\n\n${task.intent || '(intent pending)'}\n\n## Selection\n\nRoute: ${task.selection.route}\nViewport: ${task.selection.viewport.width} × ${task.selection.viewport.height}\n\n## Editable\n\n${task.scope.editable.map(file=>`- ${file}`).join('\n') || '- None; source mapping unavailable'}\n\n## Read only\n\n${task.scope.readOnly.map(file=>`- ${file}`).join('\n') || '- None'}\n\n## Constraints\n\n${task.constraints.map(value=>`- ${value}`).join('\n')}\n\n## Context\n\n\`\`\`json\n${JSON.stringify(task.context,null,2)}\n\`\`\`\n\nBudget: ${task.budget.estimatedTokens}/${task.budget.limit} (${task.budget.method}).\n`;
}

export function buildTaskProposal(packet, intent, { budget = 6000, allowEmpty = false } = {}) {
  if (typeof intent !== 'string' || (!allowEmpty && !intent.trim())) throw new TaskError(422, 'Intent required');
  if (estimateTokens(intent) > 2000) throw new TaskError(422, 'Intent exceeds 2000 UTF-8 bytes; shorten the request');
  if (!Number.isInteger(budget) || budget < 1200 || budget > 6000) throw new TaskError(422, 'Invalid token budget');
  const snapshot = sanitizeSnapshot(packet.snapshot);
  const files = values => [...new Set((values || []).filter(validFile))].slice(0,16);
  const task = {
    kind: 'dev-studio.task', version: 1, intent: intent.trim(),
    selection: {
      sourceIds: snapshot.sourceIds,
      route: text(packet.selection?.route || '/',256).split(/[?#]/)[0],
      viewport: { width: Math.max(1,Math.min(16384,Number(packet.selection?.viewport?.width)||1)), height: Math.max(1,Math.min(16384,Number(packet.selection?.viewport?.height)||1)) }
    },
    scope: { editable: files(packet.scope?.editable), readOnly: files(packet.scope?.readOnly) },
    constraints: [...new Set(['Preserve existing data fields and content.', 'Preserve keyboard access and reduced-motion behavior.', ...(packet.constraints || []).map(value=>text(value,240))])].slice(0,12),
    context: {
      domSummary: snapshot.domSummary, styles: snapshot.styles,
      sourceSnippets: (packet.sourceSnippets || []).slice(0,12).map(snippet => ({ file: text(snippet.file,200), range: snippet.range, baseRevision: snippet.baseRevision, kind: snippet.kind, code: text(snippet.code,5000), truncated: Boolean(snippet.truncated) || snippet.code?.length>5000 })),
      motion: (packet.motion || []).slice(0,4).map(binding => ({ id: binding.id, sourceFiles: files(binding.sourceFiles) })),
      limitations: snapshot.unmapped ? ['No sourceId found: DOM-only selection; editable scope is empty.'] : [],
      truncated: snapshot.domSummary.truncated,
      omissions: { styleNodes: 0, sourceSnippets: 0, domNodes: 0, repeatItems: 0 }
    },
    budget: { limit: budget, estimatedTokens: 6000, method: 'utf8-byte-upper-bound', appliesTo: 'each JSON or Markdown artifact' }
  };
  if (snapshot.unmapped) task.scope.editable = [];
  task.scope.readOnly = task.scope.readOnly.filter(file => !task.scope.editable.includes(file));
  const cost = () => Math.max(estimateTokens(task)+1,estimateTokens(taskMarkdown(task)));
  function flattened() { const all=[]; const walk=node=>{all.push(node);node.children?.forEach(walk);};task.context.domSummary.nodes.forEach(walk);return all; }
  const omit = (kind, amount=1) => { task.context.truncated = true; task.context.omissions[kind] += amount; };
  let iterations = 0;
  while (cost() > budget && ++iterations < 1000) {
    const styleIds = Object.keys(task.context.styles);
    if (styleIds.length > 4) { delete task.context.styles[styleIds.at(-1)]; omit('styleNodes'); continue; }
    const dependency = task.context.sourceSnippets.findLastIndex(snippet => snippet.kind === 'data');
    if (dependency >= 0) { task.context.sourceSnippets.splice(dependency,1); omit('sourceSnippets'); continue; }
    const long = task.context.sourceSnippets.find(snippet=>snippet.code.length>900);
    if (long) { long.code=long.code.slice(0,600)+'\n/* … source clipped; read original range … */\n'+long.code.slice(-200);long.truncated=true;task.context.truncated=true;continue; }
    const repeated = flattened().find(node=>node.repeat?.items.length>7);
    if (repeated) { repeated.repeat.items.pop();repeated.repeat.omittedItems++;omit('repeatItems');continue; }
    if (styleIds.length) { delete task.context.styles[styleIds.at(-1)];omit('styleNodes');continue; }
    const parent = flattened().findLast(node=>node.children?.length);
    if (parent) { const removed=parent.children.pop();const count=node=>1+(node.children||[]).reduce((sum,child)=>sum+count(child),0);omit('domNodes',count(removed));task.context.domSummary.nodeCount-=count(removed);continue; }
    const snippet = task.context.sourceSnippets.find(snippet=>snippet.code.length>240);
    if (snippet) { snippet.code=snippet.code.slice(0,200)+'\n/* … clipped … */';snippet.truncated=true;task.context.truncated=true;continue; }
    if (task.context.sourceSnippets.length>1) { task.context.sourceSnippets.pop();omit('sourceSnippets');continue; }
    if (task.context.domSummary.nodes.length>1) { task.context.domSummary.nodes.pop();task.context.domSummary.nodeCount--;omit('domNodes');continue; }
    throw new TaskError(422, 'Required task metadata exceeds budget; narrow the selection or intent');
  }
  if (cost() > budget) throw new TaskError(422, 'Unable to satisfy task budget');
  for (let i=0;i<3;i++) task.budget.estimatedTokens=cost();
  return { task, markdown: taskMarkdown(task), budget: task.budget };
}
