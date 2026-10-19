import fs from 'node:fs/promises';
import path from 'node:path';
const forbidden=[/data-ds-id/,/data-cw-id/,/workbench-core/,/preview-bridge/,/__companion\//,/__dev_studio_api/,/trusted-loopback/,/sessionToken/];let files=0;
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else if(/\.(html|js|css|json)$/.test(f)){files++;const s=await fs.readFile(f,'utf8');for(const re of forbidden)if(re.test(s))throw Error('PRODUCTION_RESIDUE '+f+' '+re);}}}await walk('dist');console.log('ZERO_PRODUCTION_RESIDUE PASS files='+files);
