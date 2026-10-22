'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const {spawnSync}=require('node:child_process');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'src-tauri/.stage/project');
const host=path.join(root,'apps/ivorg-website');
const required=['@astrojs/compiler-rs','esbuild','magic-string','mermaid','sax','linkedom'];
async function cleanCaches(){
 for(const name of ['.astro','.companion','node_modules/.vite','node_modules/.vite-temp']){
  const target=path.resolve(stage,name);if(!target.startsWith(stage+path.sep))throw Error('Stage boundary');
  await fs.rm(target,{recursive:true,force:true});
 }
}
async function prepare({install=true}={}){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const runtime={name:'ivorg-companion-runtime',version:manifest.version,private:true,type:'module',engines:manifest.engines,dependencies:{...manifest.dependencies}};
 for(const name of required){const version=manifest.dependencies?.[name]||manifest.devDependencies?.[name];if(!version)throw Error('Missing runtime dependency '+name);runtime.dependencies[name]=version;}
 // Never prune or rewrite the developer's node_modules/package.json/package-lock.json.
 await fs.mkdir(stage,{recursive:true});
 for(const name of ['.companion','.astro','src','workbench','public','scripts']){const target=path.resolve(stage,name);if(!target.startsWith(stage+path.sep))throw Error('Stage boundary');await fs.rm(target,{recursive:true,force:true});}
 for(const name of ['src','workbench','public'])await fs.cp(path.join(host,name),path.join(stage,name),{recursive:true,force:true,filter:file=>!file.split(path.sep).includes('.companion')});
 for(const name of ['astro.config.mjs','tsconfig.json'])try{const source=name==='astro.config.mjs'?path.join(host,name):path.join(root,name);await fs.copyFile(source,path.join(stage,name));}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.mkdir(path.join(stage,'scripts'),{recursive:true});await fs.copyFile(__filename.replace('prepare-desktop.cjs','tauri-runner.cjs'),path.join(stage,'scripts/tauri-runner.cjs'));
 const nodeVersion=JSON.parse((await fs.readFile(path.join(root,'src-tauri/binaries/node-runtime.sha256.json'),'utf8')).replace(/^\uFEFF/,'' )).version;
 await fs.mkdir(path.join(stage,'licenses'),{recursive:true});
 await fs.copyFile(path.join(root,'src-tauri/binaries',`node-v${nodeVersion}-LICENSE.txt`),path.join(stage,'licenses/Node-LICENSE.txt'));
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(runtime,null,2)+'\n');
 const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
 lock.name=runtime.name;lock.packages['']={name:runtime.name,version:runtime.version,dependencies:runtime.dependencies,engines:runtime.engines};
 // Runtime-only copy of the pinned lock: dependencies formerly marked dev are now runtime roots.
 for(const [name,entry]of Object.entries(lock.packages)){if(entry.link||name.startsWith('packages/')||name.startsWith('apps/'))delete lock.packages[name];else delete entry.dev;}
 await fs.writeFile(path.join(stage,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
 if(install){const npm=process.platform==='win32'?'npm.cmd':'npm';for(const args of [['install','--package-lock-only','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],['ci','--omit=dev','--no-audit','--no-fund']]){const result=spawnSync(npm,args,{cwd:stage,stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)throw Error('Isolated production runtime install failed');}}
 for(const [directory,name]of [['atelier','workbench'],['client','client']]){const target=path.join(stage,'node_modules/@atelier',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.cp(path.join(root,'packages',directory),target,{recursive:true,force:true,filter:file=>!file.split(path.sep).some(part=>['node_modules','src-tauri'].includes(part))});}
 const hash=createHash('sha256').update(JSON.stringify(runtime)).digest('hex');
 await fs.writeFile(path.join(stage,'desktop-runtime.json'),JSON.stringify({version:1,runtimeManifestHash:hash,runtimeDependencies:Object.keys(runtime.dependencies),excluded:['.companion','.git','tests','credentials']},null,2));
 return {stage,runtime};
}
if(require.main===module)(process.argv.includes('--clean-caches')?cleanCaches():prepare()).then(()=>console.log('DESKTOP_RUNTIME_PREPARED '+stage),()=>{console.error('DESKTOP_RUNTIME_PREPARATION_FAILED');process.exitCode=1;});
module.exports={prepare,required,cleanCaches};
