import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {configureDsh} from '../packages/atelier/src/workbench-server/dsh-adapter.js';
const args=process.argv.slice(2),argument=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const harnessRoot=argument('--harness');
if(!harnessRoot)throw Error('Usage: node scripts/configure-dsh.mjs --harness <built DeepSeek Harness checkout> [--project <host>] [--model <model>]');
const root=path.resolve(argument('--project')||fileURLToPath(new URL('../apps/ivorg-website/',import.meta.url)));
const result=await configureDsh({root,harnessRoot:path.resolve(harnessRoot),model:argument('--model')||'deepseek-v4-flash'});
console.log('ATELIER_DSH_CONFIGURED '+JSON.stringify(result));
