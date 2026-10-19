import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const [phase,step,action,...files]=process.argv.slice(2);
if(!/^P[1-4]$/.test(phase)||!/^\d+$/.test(step)||!action)throw Error('phase step action [explicit files] required');
await mkdir(new URL('../.companion/',import.meta.url),{recursive:true});
const target=new URL('../.companion/pipeline-state.json',import.meta.url);
let prior={};try{prior=JSON.parse(await readFile(target,'utf8'));}catch{}
const state={...prior,currentPhase:phase,stepIndex:Number(step),lastCompletedAction:action,testStatus:'PASS',waitingForRateLimitReset:false,retryAtTimestamp:null,updatedAt:new Date().toISOString()};
await writeFile(new URL('../.companion/pipeline-state.tmp',import.meta.url),JSON.stringify(state,null,2));
await rename(new URL('../.companion/pipeline-state.tmp',import.meta.url),target);
// Explicit paths preserve unrelated user work. Local state is deliberately ignored.
if(files.length){execFileSync('git',['add','--',...files],{cwd:root,stdio:'inherit'});execFileSync('git',['commit','-m',`chore(pipeline): checkpoint ${phase}.step${step}`],{cwd:root,stdio:'inherit'});}
