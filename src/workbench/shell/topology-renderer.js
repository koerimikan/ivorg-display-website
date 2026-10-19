export function mermaidProjection(topology) {
  const identities = new Map(topology.nodes.map((node, index) => [`n${index}`, node]));
  const ids = new Map([...identities].map(([safe, node]) => [node.id, safe]));
  return { identities, source: ['flowchart TB', ...[...identities].map(([safe,node]) => `  ${safe}["${node.id}"]`), ...topology.edges.map(edge => `  ${ids.get(edge.from)} --> ${ids.get(edge.to)}`)].join('\n') };
}
export async function renderTopology(host, topology, mermaid, open) {
  const { identities, source } = mermaidProjection(topology);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', flowchart: { htmlLabels: false }, suppressErrorRendering: true });
  const { svg } = await mermaid.render(`cwTopology${Date.now()}`, source);
  const parser = new host.ownerDocument.defaultView.DOMParser(), parsed = parser.parseFromString(svg, 'image/svg+xml');
  if (parsed.querySelector('parsererror,script,foreignObject')) throw new Error('MERMAID_UNSAFE_OUTPUT');
  const root = parsed.documentElement;
  if (root.localName.toLowerCase() !== 'svg' || [...root.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => /^on/i.test(attribute.name)))) throw new Error('MERMAID_UNSAFE_OUTPUT');
  const seen = new Set();
  for (const group of root.querySelectorAll('g.node')) {
    const safe = /^flowchart-(n\d+)-\d+$/.exec(group.getAttribute('id') || '')?.[1], object = identities.get(safe);
    if (!object || seen.has(safe)) throw new Error('MERMAID_NODE_MAPPING');
    seen.add(safe);group.setAttribute('data-node-id',object.id);group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`${object.kind}: ${object.id}`);
  }
  if (seen.size !== identities.size) throw new Error('MERMAID_NODE_MAPPING');
  const mounted = host.ownerDocument.importNode(root, true);host.replaceChildren(mounted);
  for (const group of mounted.querySelectorAll('[data-node-id]')) {
    const object = topology.nodes.find(node => node.id === group.getAttribute('data-node-id'));
    const activate = () => open(object.kind === 'page' ? 'page' : 'transition', object.id);
    group.addEventListener('click', activate);group.addEventListener('keydown', event => {if(['Enter',' '].includes(event.key)){event.preventDefault();activate();}});
  }
  return { mappedNodes: seen.size, securityLevel: 'strict' };
}

export function wireframeRows(page, objects) {
  const rows = [];
  function visit(id, depth, seen) { if (seen.has(id) || rows.length >= 7) return; const object = objects.get(id); if (!object) return; if (['ComponentZone','Node'].includes(object.type)) rows.push({ objectId:id, depth, tag:object.fields.tag||object.fields.tagHint||object.fields.role||object.type }); for(const child of object.children) visit(child,depth+1,new Set([...seen,id])); }
  visit(page.objectId,0,new Set());return rows;
}
