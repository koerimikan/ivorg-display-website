import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const engineRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
function discover(root){
 const files=(dir,pattern)=>{try{return readdirSync(path.join(root,dir)).filter(name=>pattern.test(name));}catch(error){if(error.code==='ENOENT')return [];throw error;}};
 const specs=files('workbench/specs',/^[\w.-]+\.xml$/),registries=files('workbench/objects',/^[\w.-]+\.json$/);
 if(specs.length>1||registries.length>1)throw Error('HOST_CONFIG_REQUIRED');
 const key=registries[0]?.replace(/\.object\.json$/, '')||'project';
 return {schemaVersion:1,profile:'discovered',framework:'unknown',specFile:'workbench/specs/'+(specs[0]||key+'.spec.xml'),registryFile:'workbench/objects/'+(registries[0]||key+'.object.json'),routes:{},sourceFiles:[],legacyFallback:true};
}
function relative(file,pattern){if(typeof file!=='string'||file.includes('\\')||file.split('/').includes('..')||!pattern.test(file))throw Object.assign(Error('Invalid host attachment path'),{code:'HOST_CONFIG_PATH'});return file;}
export function getHostConfig(root){
 let config;try{config=JSON.parse(readFileSync(path.join(root,'workbench/atelier.host.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;config=discover(root);}
 if(config.schemaVersion!==1||!['astro','vite','next','unknown'].includes(config.framework)||!config.routes||typeof config.routes!=='object'||Array.isArray(config.routes))throw Error('HOST_CONFIG_SCHEMA');
 relative(config.specFile,/^workbench\/specs\/[\w.-]+\.xml$/);relative(config.registryFile,/^workbench\/objects\/[\w.-]+\.json$/);
 if(config.layoutFile)relative(config.layoutFile,/^src\/[\w/.-]+\.astro$/);
 if(config.motionModule)relative(config.motionModule,/^workbench\/[\w/.-]+\.js$/);
 for(const [route,id]of Object.entries(config.routes))if(!/^\/(?!\/)[^\s<>]*$/.test(route)||typeof id!=='string'||!/^[-\w.]+$/.test(id))throw Error('HOST_CONFIG_ROUTE');
 for(const file of config.sourceFiles||[])relative(file,/^src\/[\w/.-]+\.(astro|css|js|jsx|ts|tsx|vue|svelte|html)$/);
 return config;
}
export const canonicalPaths=root=>{const host=getHostConfig(root);return {specFile:host.specFile,registryFile:host.registryFile};};
