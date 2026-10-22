'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');const manifestFile=path.join(root,'docs/WORKSPACE_MIGRATION.json');const previous=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile)):{};const moves=previous.moves||[];
function inside(p){const out=path.resolve(root,p);if(!out.startsWith(root+path.sep))throw Error('Workspace boundary');return out;}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Linked source refused');return e.isDirectory()?walk(p):[p]});}
function move(from,to){const a=inside(from),b=inside(to);if(!fs.existsSync(a)){if(fs.existsSync(b))return;throw Error('Missing '+from);}if(fs.existsSync(b))throw Error('Target already exists '+to);for(const f of walk(a))moves.push({from:path.relative(root,f).replaceAll('\\','/'),to:path.relative(root,path.join(b,path.relative(a,f))).replaceAll('\\','/'),sha256Before:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')});fs.mkdirSync(path.dirname(b),{recursive:true});fs.renameSync(a,b);}
for(const name of ['workbench-core','workbench-server','workbench','dev-studio'])move('src/'+name,'packages/atelier/src/'+name);
for(const item of (fs.existsSync(inside('src'))?fs.readdirSync(inside('src'),{withFileTypes:true}):[])){if(!item.isDirectory())throw Error('Unexpected root source file');move('src/'+item.name,'apps/ivorg-website/src/'+item.name);}
for(const name of ['public','workbench','spec'])move(name,'apps/ivorg-website/'+name);
if(fs.existsSync(inside('astro.config.mjs'))){fs.renameSync(inside('astro.config.mjs'),inside('apps/ivorg-website/astro.config.mjs'));moves.push({from:'astro.config.mjs',to:'apps/ivorg-website/astro.config.mjs'});}
fs.mkdirSync(inside('packages/client/src'),{recursive:true});if(fs.existsSync(inside('packages/atelier/src/workbench/preview-bridge.js')))fs.renameSync(inside('packages/atelier/src/workbench/preview-bridge.js'),inside('packages/client/src/preview-bridge.js'));
for(const name of ['assets','core','pages','styles','motion'])move(name,'apps/ivorg-website/legacy/'+name);
const bridge=moves.find(x=>x.from==='src/workbench/preview-bridge.js');if(bridge)bridge.to='packages/client/src/preview-bridge.js';
fs.writeFileSync(inside('docs/WORKSPACE_MIGRATION.json'),JSON.stringify({...previous,schemaVersion:1,hostRoot:'apps/ivorg-website',engineRoot:'packages/atelier',moves},null,2)+'\n');
console.log('Moved files: '+moves.length);
