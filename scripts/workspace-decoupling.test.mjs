import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rename,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {projectFixture} from './project-fixture.mjs';
import {createControlServer,loadProject} from '@atelier/workbench/server';
import {getHostConfig} from '../packages/atelier/src/workbench-server/host-config.js';
import atelier from '@atelier/client/vite';
const repo=fileURLToPath(new URL('../',import.meta.url));

test('real workspace boundaries preserve user stylesheet and remove tool imports from business source',async()=>{
 const manifest=JSON.parse(await readFile(path.join(repo,'package.json'),'utf8'));assert.deepEqual(manifest.workspaces,['packages/*','apps/*']);
 const css=await readFile(path.join(repo,'apps/ivorg-website/src/styles/shell.css'));assert.equal(createHash('sha256').update(css).digest('hex'),'dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e');
 for(const file of ['src/layouts/SiteLayout.astro','src/scripts/home.js','src/scripts/app.js'])assert.doesNotMatch(await readFile(path.join(repo,'apps/ivorg-website',file),'utf8'),/dev-studio|workbench-core|workbench-server|@atelier/);
 await assert.rejects(readFile(path.join(repo,'src/workbench-server/server.js')));
});

test('control assets come from engine package while canonical paths belong to the host',async t=>{
 const root=await projectFixture(t),file=path.join(root,'workbench/atelier.host.json'),host=JSON.parse(await readFile(file,'utf8'));
 await rename(path.join(root,host.specFile),path.join(root,'workbench/specs/demo.spec.xml'));await rename(path.join(root,host.registryFile),path.join(root,'workbench/objects/demo.object.json'));
 host.specFile='workbench/specs/demo.spec.xml';host.registryFile='workbench/objects/demo.object.json';await writeFile(file,JSON.stringify(host));
 assert.equal((await loadProject(root)).topology.pages.length,3);await assert.rejects(readFile(path.join(root,'src/workbench/shell/index.html')));
 const control=await createControlServer({root,port:0});t.after(()=>control.stop());const origin=`http://127.0.0.1:${control.server.address().port}`;
 assert.equal((await fetch(origin+'/')).status,200);assert.equal((await fetch(origin+'/src/workbench-core/bridge.js')).status,200);assert.equal((await fetch(origin+'/src/workbench-server/server.js')).status,404);
});

test('unregistered write profiles fail closed and attachment path traversal is rejected',async t=>{
 const root=await projectFixture(t),file=path.join(root,'workbench/atelier.host.json'),host=JSON.parse(await readFile(file,'utf8'));host.profile='generic';await writeFile(file,JSON.stringify(host));
 await assert.rejects(createControlServer({root,port:0,enableWrites:true}),{code:'HOST_WRITE_ADAPTER_UNAVAILABLE'});
 const server=await createControlServer({root,port:0});t.after(()=>server.stop());assert.match(await fetch(`http://127.0.0.1:${server.server.address().port}/`).then(r=>r.text()),/data-atelier-profile="generic"/);
 host.registryFile='../outside.json';await writeFile(file,JSON.stringify(host));assert.throws(()=>getHostConfig(root),{code:'HOST_CONFIG_PATH'});
});

test('real Vite SDK supplies revision metadata and strips control credentials without claiming AST mappings',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'atelier-vite-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'src'));
 await writeFile(path.join(root,'package.json'),' {"type":"module"}');await writeFile(path.join(root,'src/main.ts'),'export const message="host only";');await writeFile(path.join(root,'index.html'),'<html><head></head><body><main>Hello host</main></body></html>');
 await symlink(path.join(repo,'node_modules'),path.join(root,'node_modules'),'junction');
 const echo={name:'echo',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/echo')return next();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cookie:req.headers.cookie||'',authorization:req.headers.authorization||''}));});}};
 const server=await createServer({root,configFile:false,plugins:[atelier({routes:{'/':'page.demo'}}),echo],server:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'silent'});t.after(()=>server.close());await server.listen();
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`,html=await fetch(origin+'/').then(r=>r.text()),state=await fetch(origin+'/__companion/preview-state').then(r=>r.json());
 assert.match(html,/cw-preview-revision/);assert.match(html,new RegExp(state.docRevision));assert.ok(state.sourceRevisions['src/main.ts']);assert.equal(state.sourceMapping,false);assert.equal(state.readOnly,true);
 assert.deepEqual(await fetch(origin+'/echo',{headers:{Cookie:'cw_session=private',Authorization:'Bearer private'}}).then(r=>r.json()),{cookie:'',authorization:''});
});

test('migration inventory returns actual Astro AST evidence and never writes the host',async()=>{
 const file=path.join(repo,'apps/ivorg-website/src/pages/index.astro'),before=await readFile(file);
 const report=JSON.parse(execFileSync(process.execPath,['packages/atelier/bin/atelier.mjs','analyze','--project','apps/ivorg-website'],{cwd:repo,encoding:'utf8',windowsHide:true}));
 assert.equal(report.framework,'astro');assert.equal(report.readOnly,true);assert.equal(report.migration.automaticConversion,false);assert.equal(report.astroEvidence.filter(item=>item.routePattern).length,3);assert.ok(report.astroEvidence.some(item=>item.componentTags.includes('SiteLayout')));assert.deepEqual(await readFile(file),before);
});


test('workspace lock attestation follows the host boundary and rejects unrelated ancestors',async t=>{
 const {dependencyLock}=await import('../packages/atelier/src/workbench-server/dependency-lock.js');
 assert.equal(await dependencyLock(path.join(repo,'apps/ivorg-website')),path.join(repo,'package-lock.json'));
 const temp=await mkdtemp(path.join(os.tmpdir(),'atelier-lock-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const host=path.join(temp,'host');await mkdir(host);await writeFile(path.join(temp,'package-lock.json'),'{}');await writeFile(path.join(temp,'package.json'),'{}');
 await assert.rejects(dependencyLock(host),/DEPENDENCY_LOCK_WORKSPACE_REQUIRED/);
 await writeFile(path.join(host,'package-lock.json'),'{}');assert.equal(await dependencyLock(host),path.join(host,'package-lock.json'));
});
