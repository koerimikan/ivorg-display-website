import { readFile } from 'node:fs/promises';
const files = ['src/workbench/shell/app.js','src/workbench/preview-bridge.js','src/workbench-server/server.js','src/workbench-server/preview-integration.js'];
export async function checkStaticSecurity(root = new URL('../', import.meta.url)) {
  const sources = await Promise.all(files.map(file=>readFile(new URL(file,root),'utf8')));
  const text = sources.join('\n');
  if (/\bcontentDocument\b/.test(text)) throw new Error('Forbidden parent DOM access');
  if (/\b(?:navigate|eval)\s*\(/.test(text)) throw new Error('Forbidden fixture navigation/eval');
  const calls = [...text.matchAll(/\.postMessage\(([\s\S]*?)\);/g)];
  if (calls.length !== 2 || calls.some(m=>!/,\s*(?:PREVIEW_ORIGIN|CONTROL_ORIGIN)\s*$/.test(m[1]))) throw new Error('Unpinned postMessage target');
  return { contentDocumentReads:0, wildcardTargets:0, pinnedPostMessageTargets:calls.length, fixtureNavigationCalls:0 };
}
if (process.argv[1]?.replaceAll('\\','/').endsWith('/workbench-p1-security.mjs')) {
  try { console.log('P1_STATIC_SECURITY '+JSON.stringify(await checkStaticSecurity())); }
  catch(error){console.error(error.message);process.exitCode=1;}
}
