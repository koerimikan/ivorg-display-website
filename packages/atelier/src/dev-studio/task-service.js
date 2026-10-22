import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, realpath, lstat, writeFile, rename, unlink } from 'node:fs/promises';
import { parse } from '@astrojs/compiler-rs';
import { revision } from './source-engine.js';
import { sanitizeSnapshot, buildTaskProposal, TaskError } from './task-proposal.js';
import { MOTION_BINDINGS } from './motion-context.js';

export function createTaskService({ root, lookup, readContextFile }) {
  const contexts = new Map();
  let exportQueue = Promise.resolve();
  async function context(body) {
    const snapshot = sanitizeSnapshot(body?.snapshot);
    const sourceSnippets = [], editable = new Set(), readOnly = new Set(), sourceRevisions = {};
    const covered = [], imports = new Map();
    const records = [];
    for (const id of snapshot.sourceIds) {
      const result = await lookup(id);
      if (revision(result.source) !== result.record.baseRevision) throw new TaskError(409,'Source changed; select again');
      records.push(result);
    }
    records.sort((a,b)=>(b.record.range[1]-b.record.range[0])-(a.record.range[1]-a.record.range[0]));
    for (const { record, source } of records) {
      editable.add(record.file); sourceRevisions[record.file]=record.baseRevision;
      if (!covered.some(other=>other.file===record.file && other.range[0]<=record.range[0] && other.range[1]>=record.range[1])) {
        covered.push(record);
        const [start,end]=record.range;
        sourceSnippets.push({ file: record.file, range: record.range, baseRevision: record.baseRevision, kind:'template', code:source.slice(start,Math.min(end,start+5000)), truncated:end-start>5000 });
      }
      if (!imports.has(record.file)) {
        const declarations = parse(source).ast.frontmatter?.program?.body || [];
        imports.set(record.file,{source,variables:declarations.filter(node=>node.type==='VariableDeclaration'),declarations:declarations.filter(node=>node.type==='ImportDeclaration').map(node=>({ specifier:node.source?.value, names:(node.specifiers||[]).map(item=>item.local?.name).filter(Boolean) }))});
      }
    }
    for (const [file,{declarations,variables,source}] of imports) {
      let relevant = sourceSnippets.filter(snippet=>snippet.file===file).map(snippet=>snippet.code).join('\n');
      const included=new Set();
      for(let pass=0;pass<3;pass++)for(const variable of variables){
        if(included.has(variable.start))continue;
        if((variable.declarations||[]).some(item=>item.id?.type==='Identifier'&&new RegExp(`\\b${item.id.name}\\b`).test(relevant))){
          included.add(variable.start);const code=source.slice(variable.start,Math.min(variable.end,variable.start+1000));
          sourceSnippets.push({file,range:[variable.start,variable.end],baseRevision:sourceRevisions[file],kind:'binding',code,truncated:variable.end-variable.start>1000});relevant+='\n'+code;
        }
      }
      for (const declaration of declarations) {
        const specifier=declaration.specifier;
        if (typeof specifier!=='string' || !specifier.startsWith('.') || !/\.(css|js)$/.test(specifier)) continue;
        const imported=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
        if (!imported.startsWith('src/')) continue;
        // Only known local imports are readable. No client-supplied arbitrary source paths.
        const content = await readContextFile(imported);
        sourceRevisions[imported]=revision(content);
        if (imported.endsWith('.css')) { editable.add(imported); continue; }
        readOnly.add(imported);
        const names = declaration.names.filter(name=>new RegExp(`\\b${name}\\b`).test(relevant));
        if (!names.length) continue;
        for (const name of names.slice(0,2)) {
          const match = new RegExp(`export\\s+(?:const|let|function)\\s+${name}\\b`).exec(content);
          const start = match?.index || 0;
          const next = content.indexOf('\nexport ',start+1);
          const end = Math.min(next<0?content.length:next,start+1500);
          if (!sourceSnippets.some(snippet=>snippet.file===imported && snippet.range[0]===start)) sourceSnippets.push({file:imported,range:[start,end],baseRevision:revision(content),kind:'data',code:content.slice(start,end),truncated:end<(next<0?content.length:next)});
        }
      }
    }
    const motion = MOTION_BINDINGS.filter(binding=>Array.isArray(body.motionIds) && body.motionIds.includes(binding.id));
    for (const binding of motion) for (const file of binding.sourceFiles) readOnly.add(file);
    const packet = {
      snapshot, selection:body.selection || {},
      scope:{editable:[...editable],readOnly:[...readOnly]}, sourceSnippets,
      motion, constraints:motion.flatMap(binding=>binding.constraints), sourceRevisions
    };
    const preview=buildTaskProposal(packet,'',{allowEmpty:true});
    const contextId=`ctx_${randomBytes(16).toString('hex')}`;
    contexts.set(contextId,{packet,expires:Date.now()+10*60*1000});
    while(contexts.size>16)contexts.delete(contexts.keys().next().value);
    return {contextId,context:preview.task.context,selection:preview.task.selection,scope:preview.task.scope,constraints:preview.task.constraints,motion:preview.task.context.motion,budget:preview.budget};
  }
  async function proposal(body) {
    const saved=contexts.get(body?.contextId);
    if(!saved || saved.expires<Date.now()) {contexts.delete(body?.contextId);throw new TaskError(409,'Context expired; select again');}
    for(const [file,expected] of Object.entries(saved.packet.sourceRevisions)) {
      if(revision(await readContextFile(file))!==expected)throw new TaskError(409,'Context source revision changed; select again');
    }
    return buildTaskProposal(saved.packet,body.intent);
  }
  async function save(result) {
    const actualRoot=await realpath(root);
    let directory=actualRoot;
    for(const part of ['.dev-studio','tasks']) {
      directory=path.join(directory,part);
      await mkdir(directory).catch(error=>{if(error.code!=='EEXIST')throw error;});
      if((await lstat(directory)).isSymbolicLink() || !(await lstat(directory)).isDirectory())throw new TaskError(403,'Task output directory cannot be a symlink');
    }
    const artifacts={ 'latest.json':JSON.stringify(result.task,null,2)+'\n', 'dev-studio.task.json':JSON.stringify(result.task,null,2)+'\n', 'task.md':result.markdown };
    // Preflight every output first, prepare all bytes, publish canonical latest.json last.
    const prepared=[];
    try { for(const [name,content] of Object.entries(artifacts)) {
      const target=path.join(directory,name);
      try {if((await lstat(target)).isSymbolicLink())throw new TaskError(403,'Task output file cannot be a symlink');}
      catch(error){if(error.code!=='ENOENT')throw error;}
      prepared.push({target,content,temporary:`${target}.${randomBytes(8).toString('hex')}.tmp`,canonical:name==='latest.json'});
    }
    for(const file of prepared)await writeFile(file.temporary,file.content,{flag:'wx',encoding:'utf8'});
    prepared.sort((a,b)=>Number(a.canonical)-Number(b.canonical));
    for(const file of prepared)await rename(file.temporary,file.target);
    } finally { for(const file of prepared)await unlink(file.temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
    return {...result,files:Object.keys(artifacts).map(name=>`.dev-studio/tasks/${name}`)};
  }
  return {
    context,proposal,
    exportTask(body){const result=exportQueue.then(async()=>save(await proposal(body)));exportQueue=result.catch(()=>{});return result;}
  };
}
