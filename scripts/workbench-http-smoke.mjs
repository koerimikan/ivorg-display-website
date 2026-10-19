import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { projectFixture } from './project-fixture.mjs';
import { createControlServer } from '../src/workbench-server/server.js';
const destination=fileURLToPath(new URL('../.companion/',import.meta.url)),cleanup=[],root=await projectFixture({after:fn=>cleanup.push(fn)});
let control,preview;
try{
  process.env.COMPANION_P1='1';control=await createControlServer({root,port:4323,enableWrites:true});
  const {dev}=await import('astro');preview=await dev({root,server:{host:'127.0.0.1',port:4321},vite:{server:{strictPort:true}}});
  assert.equal(preview.address.port,4321);
  const origin='http://127.0.0.1:4323',credentials=await readFile(path.join(root,'.companion/auth/bootstrap-owner.txt'),'utf8'),password=/^password=(.+)$/m.exec(credentials)[1];
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({userId:'owner',password})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],{csrfToken}=await login.json(),headers={Cookie:cookie};
  const health=await fetch(origin+'/api/health',{headers}).then(r=>r.json());assert.equal(health.stage,'P4');assert.equal(health.origin,origin);assert.equal(health.previewOrigin,'http://127.0.0.1:4321');
  const project=await fetch(origin+'/api/project',{headers}).then(r=>r.json());assert.equal(project.topology.pages.length,3);assert.equal(project.topology.bindings.length,15);
  for(const route of ['/','/discography/','/newsletter/']){const response=await fetch('http://127.0.0.1:4321'+route);assert.equal(response.status,200);assert.match(await response.text(),/cw-preview-revision/);}
  const bundle=await fetch(origin+'/vendor/mermaid.js');assert.equal(bundle.status,200);const rendererBytes=(await bundle.arrayBuffer()).byteLength;assert.ok(rendererBytes>100000);
  assert.equal((await fetch('http://127.0.0.1:4321/__dev_studio_api/source/patch',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/api/fixture/session',{method:'POST',headers:{...headers,Origin:'http://foreign.invalid','x-companion-token':csrfToken,'Content-Type':'application/json'},body:'{}'})).status,403);
  const fixture=await fetch(origin+'/api/fixture/session',{method:'POST',headers:{...headers,Origin:origin,'x-companion-token':csrfToken,'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());assert.match(fixture.sessionId,/^sess\./);
  const result={status:'PASS',control:origin,preview:'http://127.0.0.1:4321',authenticatedP4:true,pages:3,enabledBindings:15,previewRoutes:3,localMermaidBundleBytes:rendererBytes,oldWriteRpc:403,foreignOrigin:403,fixtureIdentity:true,businessSourceWritten:false,browserAutomation:false,verifiedAt:new Date().toISOString()};
  await mkdir(destination,{recursive:true});await writeFile(path.join(destination,'dual-origin-smoke.json'),JSON.stringify(result,null,2));console.log('DUAL_ORIGIN_HTTP_SMOKE',JSON.stringify(result));
}finally{await preview?.stop();await control?.stop();for(const fn of cleanup.reverse())await fn();}
