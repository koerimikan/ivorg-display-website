import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const file=new URL('../packages/atelier/src/workbench/shell/topology-renderer.js',import.meta.url),marker='// BEGIN GENERATED RHINE CAMERA';
const result=await build({absWorkingDir:root,entryPoints:['packages/atelier/src/workbench/shell/rhine-camera.source.js'],bundle:true,write:false,format:'iife',globalName:'rhineCameraRuntime',platform:'browser',target:'es2022',minify:true,legalComments:'inline'});
const current=await readFile(file,'utf8'),original=current.split(marker)[0].trimEnd();
const generated=original+'\n\n'+marker+' — node scripts/build-rhine-camera.mjs\n'+result.outputFiles[0].text+'\n// END GENERATED RHINE CAMERA\n';
if(process.argv.includes('--check')){if(current!==generated)throw Error('RHINE_CAMERA_BUNDLE_STALE');console.log('Rhine camera bundle matches source and installed GSAP core.');}
else{await writeFile(file,generated);console.log('Rhine camera bundled with installed GSAP core; no new HTTP asset or external script origin.');}
