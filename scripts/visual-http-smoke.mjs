import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),origin='http://127.0.0.1:4323',preview='http://127.0.0.1:4321';
const sha=value=>createHash('sha256').update(value).digest('hex');
const artifacts=new URL(process.argv.includes('--luminous')?'.companion/luminous-verification/':'.companion/visual-verification/',root);await mkdir(artifacts,{recursive:true});
const tests=spawnSync(process.execPath,['--test','--test-reporter=spec','scripts/visual-shell.test.mjs'],{cwd:fileURLToPath(root),encoding:'utf8',windowsHide:true});
await writeFile(new URL('visual-shell.txt',artifacts),(tests.stdout||'')+(tests.stderr||'')+`\nEXIT_CODE=${tests.status}\n`);assert.equal(tests.status,0);
const testCount=Number(/ℹ tests (\d+)/u.exec(tests.stdout)?.[1]);assert.ok(Number.isInteger(testCount)&&testCount>0,'missing actual test count');
const assets={};
for(const name of ['app.js','styles.css','index.html','client.js','login.js','memory.js','changes.js','topology-renderer.js']){
 const response=await fetch(origin+(name==='index.html'?'/':'/'+name),{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
 const body=await response.text(),local=await readFile(new URL('src/workbench/shell/'+name,root),'utf8');assert.equal(sha(body),sha(local),name+' served stale bytes');assets[name]=sha(body);
 if(name.endsWith('.js')){const syntax=spawnSync(process.execPath,['--check','src/workbench/shell/'+name],{cwd:fileURLToPath(root),encoding:'utf8',windowsHide:true});assert.equal(syntax.status,0,syntax.stderr);}
}
const bridge=await fetch(preview+'/src/workbench/preview-bridge.js',{signal:AbortSignal.timeout(15000)});assert.equal(bridge.status,200);assert.match(await bridge.text(),/drawSelection/);
const routes={};for(const route of ['/','/discography/','/newsletter/']){const response=await fetch(preview+route,{signal:AbortSignal.timeout(15000)});routes[route]=response.status;assert.equal(response.status,200);assert.match(await response.text(),/cw-preview-revision/);}
const credentials=await readFile(new URL('.companion/auth/bootstrap-owner.txt',root),'utf8'),password=/^password=(.+)$/m.exec(credentials)?.[1];assert.ok(password,'bootstrap credential unavailable');
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({userId:'owner',password}),signal:AbortSignal.timeout(15000)});assert.equal(login.status,200,'local owner login rejected');
const cookie=login.headers.get('set-cookie').split(';')[0],identity=await login.json();let topology;
try{const response=await fetch(origin+'/api/project',{headers:{Cookie:cookie},signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);const project=await response.json();topology={pages:project.topology.pages.length,bindings:project.topology.bindings.length};assert.deepEqual(topology,{pages:3,bindings:15});}
finally{await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-Companion-Token':identity.csrfToken},body:'{}'});}
const core=spawnSync('git',['diff','--name-only','--','src/workbench-core','src/workbench-server'],{cwd:fileURLToPath(root),encoding:'utf8',windowsHide:true});assert.equal(core.status,0);assert.equal(core.stdout.trim(),'');
const css=sha(await readFile(new URL('src/styles/shell.css',root)));assert.equal(css,'dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e');
const gate=JSON.parse(await readFile(new URL('.companion/gates/P4.json',root),'utf8'));assert.equal(gate.status,'PASS');
const evidence={status:'PASS',verifiedAt:new Date().toISOString(),control:origin,preview,assets,previewRoutes:routes,topology,visualTests:testCount,scope:'http-and-unit-verification-only',coreServerUnmodified:true,userCssPreserved:css,gateVerifiedAt:gate.verifiedAt,browserAutomation:false,humanVisualAcceptance:'NOT_RUN'};
await writeFile(new URL('http-smoke.json',artifacts),JSON.stringify(evidence,null,2)+'\n');console.log('VISUAL_HTTP_SMOKE',JSON.stringify(evidence));
