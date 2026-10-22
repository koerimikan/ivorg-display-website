#!/usr/bin/env node
import path from 'node:path';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {createControlServer} from '../src/workbench-server/server.js';
import {parse} from '@astrojs/compiler-rs';
import {analyzeSource} from '../src/dev-studio/source-engine.js';
import {getHostConfig} from '../src/workbench-server/host-config.js';
const args=process.argv.slice(2),command=args.shift(),flag=args.indexOf('--project');
if(!['analyze','serve'].includes(command)||flag<0||!args[flag+1])throw Error('Usage: atelier analyze|serve --project <directory>');
const root=await realpath(path.resolve(args[flag+1]));
if(command==='analyze'){
 const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),deps={...manifest.dependencies,...manifest.devDependencies};
 const framework=deps.next?'next':deps.astro?'astro':deps.vite?'vite':'unknown',files=[];
 async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink()||['node_modules','.git','.companion','dist','.next','.astro'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(/\.(astro|[jt]sx?|vue|svelte|html|css)$/.test(file))files.push(path.relative(root,file).replaceAll('\\','/'));}}
 await visit(root);
 const astroEvidence=[];
 for(const file of files.filter(file=>file.endsWith('.astro'))){const source=await readFile(path.join(root,file),'utf8'),analysis=analyzeSource(source,file),tags=new Set();function scan(node){if(!node||typeof node!=='object')return;if(node.type==='JSXElement'&&/^[A-Z]/.test(node.openingElement?.name?.name||''))tags.add(node.openingElement.name.name);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==='object')scan(value);}scan(parse(source).ast);astroEvidence.push({file,elements:analysis.records.length,componentTags:[...tags],routePattern:file.startsWith('src/pages/')?'/'+file.slice(10).replace(/(?:^|\/)index\.astro$/, '').replace(/\.astro$/, '')+'/':null,dynamic:file.includes('[')});}
 for(const item of astroEvidence)if(item.routePattern)item.routePattern=item.routePattern.replace(/\/+/g,'/');
 console.log(JSON.stringify({schemaVersion:1,root,framework,readOnly:true,files,astroEvidence,astWriteSupport:framework==='astro'?'explicit anchored Astro operations with a registered write policy':'unsupported',migration:{target:'Astro Islands',automaticConversion:false,steps:['Inventory routes and browser-only dependencies','Classify static content versus interactive islands','Define route and source identity mapping','Migrate one page with content/parity checks','Require reviewed ChangePlans before source changes']}},null,2));
}else{
 const control=await createControlServer({root,enableWrites:getHostConfig(root).profile==='ivorg-v1'&&!args.includes('--read-only')});console.log('ATELIER CONTROL http://127.0.0.1:4323 (start the host preview separately on 4321)');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void control.stop().then(()=>process.exit(0)));
}
