import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, symlink, realpath, readFile, writeFile, readdir, copyFile, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const base=await realpath(os.tmpdir()),temp=await mkdtemp(path.join(base,'cw-clean-archive-')),checkout=path.join(temp,'checkout'),archive=path.join(temp,'source.tar');
const destination=path.join(root,'.companion/clean-archive-gates');await mkdir(destination,{recursive:true});
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),userFile=path.join(root,'src/styles/shell.css'),beforeUserHash=sha(await readFile(userFile));
let success=false;
try{
  await mkdir(checkout);execFileSync('git',['archive','--format=tar','-o',archive,head],{cwd:root,windowsHide:true});execFileSync('tar',['-xf',archive,'-C',checkout],{windowsHide:true});
  await symlink(path.join(root,'node_modules'),path.join(checkout,'node_modules'),process.platform==='win32'?'junction':'dir');
  const expectedCss=execFileSync('git',['show',head+':src/styles/shell.css'],{cwd:root});
  if(sha(expectedCss)!==sha(await readFile(path.join(checkout,'src/styles/shell.css'))))throw Error('ARCHIVE_CSS_NOT_TRACKED_BYTES');
  const results=[];
  for(const phase of ['P1','P2','P3','P4']){
    console.log('CLEAN_ARCHIVE_START',phase,head);
    const child=spawnSync(process.execPath,['scripts/pipeline-gate.mjs',phase],{cwd:checkout,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
    await writeFile(path.join(destination,phase+'-runner.txt'),(child.stdout||'')+(child.stderr||'')+'\nEXIT_CODE='+child.status+'\n');
    for(const file of await readdir(path.join(checkout,'.companion/gates')))await copyFile(path.join(checkout,'.companion/gates',file),path.join(destination,file));
    if(child.status!==0)throw Error('CLEAN_ARCHIVE_GATE_FAILED '+phase);
    results.push({phase,status:'PASS'});console.log('CLEAN_ARCHIVE_PASS',phase);
  }
  if(sha(await readFile(userFile))!==beforeUserHash)throw Error('USER_CSS_CHANGED');
  await writeFile(path.join(destination,'summary.json'),JSON.stringify({status:'PASS',head,node:process.version,platform:process.platform,verifiedAt:new Date().toISOString(),results,trackedCssHash:sha(expectedCss),preservedUserCssHash:beforeUserHash,temporaryCheckoutRemoved:true},null,2));success=true;
}finally{
  // Only this mkdtemp-created directory can be removed; never follow a computed workspace target.
  const resolved=await realpath(temp);if(!resolved.startsWith(base+path.sep+'cw-clean-archive-'))throw Error('UNSAFE_CLEANUP_PATH');
  await unlink(path.join(checkout,'node_modules'));
  if(success)await rm(resolved,{recursive:true,force:true});else console.error('Failed archive preserved for diagnosis:',resolved);
}
