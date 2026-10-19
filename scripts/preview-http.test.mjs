import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,appendFile} from 'node:fs/promises';import net from 'node:net';import path from 'node:path';import {dev} from 'astro';import {parseHTML} from 'linkedom';import {projectFixture} from './project-fixture.mjs';import {hash} from '../src/workbench-core/objects/spec.js';
test('actual Astro preview: rendered revision matches source manifest, identities are unique and control credentials are stripped',async t=>{
  const cleanup=[],root=await projectFixture({after:fn=>cleanup.push(fn)});let preview;
  const previous=process.env.COMPANION_P1;process.env.COMPANION_P1='1';
  t.after(async()=>{await preview?.stop();if(previous===undefined)delete process.env.COMPANION_P1;else process.env.COMPANION_P1=previous;for(const fn of cleanup.reverse())await fn();});
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  await writeFile(path.join(root,'src/pages/cw-credential-probe.astro'),'---\nexport const prerender=false;\nconst credentials={cookie:Astro.request.headers.get("cookie")||"",authorization:Astro.request.headers.get("authorization")||"",control:Astro.request.headers.get("x-control-probe")||""};\n---\n<div id="probe">{JSON.stringify(credentials)}</div>');
  preview=await dev({root,server:{host:'127.0.0.1',port},vite:{server:{strictPort:true}}});const origin=`http://127.0.0.1:${port}`;
  const response=await fetch(origin+'/newsletter/'),html=await response.text();assert.equal(response.status,200);const document=parseHTML(html).document;
  const state=await fetch(origin+'/__companion/preview-state').then(r=>r.json());assert.equal(document.querySelector('meta[name="cw-preview-revision"]').content,state.docRevision);assert.equal(state.sourceRevisions['src/pages/newsletter.astro'],hash(await readFile(path.join(root,'src/pages/newsletter.astro'))));
  assert.doesNotMatch(html,/<[^>]+data-cw-id="[^"]+"[^>]*data-cw-id=/);assert.match(document.querySelector('#page-wipe').getAttribute('data-cw-ids'),/cmp\.pageWipe/);assert.match(document.querySelector('#page-wipe').getAttribute('data-cw-ids'),/zone\.wipe\.sheet/);
  const credentialResponse=await fetch(origin+'/cw-credential-probe/',{headers:{Cookie:'cw_session=must-not-reach-ssr',Authorization:'Bearer must-not-reach-ssr','X-Control-Probe':'visible'}}),credentials=JSON.parse(parseHTML(await credentialResponse.text()).document.querySelector('#probe').textContent);assert.deepEqual(credentials,{cookie:'',authorization:'',control:'visible'});
  assert.equal((await fetch(origin+'/__dev_studio_api/commit',{method:'POST'})).status,403);
  const before=state.docRevision;await appendFile(path.join(root,'src/styles/newsletter.css'),'\n/* HMR revision test */\n');let fresh=false;
  for(let attempt=0;attempt<20;attempt++){await new Promise(resolve=>setTimeout(resolve,100));const manifest=await fetch(origin+'/__companion/preview-state').then(r=>r.json()),page=parseHTML(await fetch(origin+'/newsletter/').then(r=>r.text())).document;if(manifest.docRevision!==before&&page.querySelector('meta[name="cw-preview-revision"]')?.content===manifest.docRevision){fresh=true;break;}}
  assert.equal(fresh,true,'HMR must invalidate the layout revision stamp even when only another CSS module changed');
});
