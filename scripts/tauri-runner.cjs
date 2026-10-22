'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {fork,spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');
const readline=require('node:readline');

function options(argv){const result={root:path.resolve(__dirname,'..'),controlPort:4323,previewPort:4321};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--root')result.root=path.resolve(argv[++i]);else if(key==='--worker')result.worker=argv[++i];else if(key==='--control-port')result.controlPort=Number(argv[++i]);else if(key==='--preview-port')result.previewPort=Number(argv[++i]);else throw Error('Unknown desktop runner argument');}const configFile=path.join(result.root,'atelier.workspace.json');if(require('node:fs').existsSync(configFile)){const workspace=JSON.parse(require('node:fs').readFileSync(configFile,'utf8'));const hostRoot=path.resolve(result.root,workspace.defaultHost);if(!hostRoot.startsWith(result.root+path.sep))throw Error('Host root outside workspace');result.root=hostRoot;}for(const port of [result.controlPort,result.previewPort])if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port');if(result.controlPort===result.previewPort)throw Error('Distinct ports required');return result;}
async function available(port){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>server.close(resolve));}
async function killOwnedTree(child){if(child.exitCode!==null||child.signalCode)return;if(process.platform==='win32'){await new Promise(resolve=>{const killer=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',resolve);killer.once('exit',resolve);});}else{try{child.kill('SIGKILL');}catch{}}}

async function worker(config){
 process.chdir(config.root);process.env.COMPANION_P1='1';process.env.ASTRO_TELEMETRY_DISABLED='1';process.env.ASTRO_DISABLE_UPDATE_CHECK='true';
 const requireProject=createRequire(path.join(config.root,'package.json'));let server,stopping=false;
 async function stop(code=0){if(stopping)return;stopping=true;clearInterval(parentWatch);try{if(config.worker==='control'){server?.server?.closeIdleConnections?.();server?.server?.closeAllConnections?.();}await server?.stop();try{requireProject('esbuild').stop();}catch{}}finally{process.exit(code);}}
 const parentPid=process.ppid,parentWatch=setInterval(()=>{try{process.kill(parentPid,0);}catch{void stop(0);}},500);parentWatch.unref();
 process.on('message',message=>{if(message?.command==='shutdown')void stop();});process.on('disconnect',()=>void stop());
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void stop());
 const emergency=setTimeout(()=>{if(!server)void stop(1);},30000);emergency.unref();
 try{
  if(config.worker==='control'){const {createControlServer}=await import(pathToFileURL(requireProject.resolve('@atelier/workbench/server')).href);server=await createControlServer({root:config.root,port:config.controlPort,enableWrites:true});}
  else if(config.worker==='preview'){const {dev}=await import(pathToFileURL(requireProject.resolve('astro')).href);server=await dev({root:config.root,server:{host:'127.0.0.1',port:config.previewPort},vite:{server:{strictPort:true}}});if(server.address.port!==config.previewPort)throw Error('Preview port drift');}
  else throw Error('Unknown worker');
  clearTimeout(emergency);process.send?.({kind:'ready',role:config.worker,pid:process.pid});
 }catch{process.send?.({kind:'failed',role:config.worker});await stop(1);}
}

async function supervise(config){
 // Never attach to, authenticate against, or terminate an existing unrelated service.
 await available(config.controlPort);await available(config.previewPort);

 const launchId=process.env.COMPANION_DESKTOP_LAUNCH||require('node:crypto').randomUUID();if(!/^[a-zA-Z0-9-]{1,80}$/.test(launchId))throw Error('Missing launch identity');
 const readyFile=path.join(config.root,'.companion/desktop','ready-'+launchId+'.json');
 let stopping=false;const children=[],ready=new Set();let finish;
 const done=new Promise(resolve=>{finish=resolve;});
 async function shutdown(code=0){if(stopping)return;stopping=true;clearInterval(parentWatch);clearTimeout(startupTimer);for(const child of children)if(child.connected)child.send({command:'shutdown'},()=>{});
  await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();const timer=setTimeout(()=>{void killOwnedTree(child).finally(resolve);},5000);timer.unref();child.once('exit',()=>{clearTimeout(timer);resolve();});})));
  await fs.rm(readyFile,{force:true});finish(code);
 }
 const parentPid=process.ppid,parentWatch=setInterval(()=>{try{process.kill(parentPid,0);}catch{void shutdown();}},500);parentWatch.unref();
 const startupTimer=setTimeout(()=>void shutdown(1),30000);
 const input=readline.createInterface({input:process.stdin});input.on('line',line=>{if(line==='shutdown')void shutdown();});input.on('close',()=>void shutdown());
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void shutdown());
 for(const role of ['control','preview']){
  const child=fork(__filename,['--worker',role,'--root',config.root,'--control-port',String(config.controlPort),'--preview-port',String(config.previewPort)],{cwd:config.root,execPath:process.execPath,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,COMPANION_P1:'1',ASTRO_TELEMETRY_DISABLED:'1'}});children.push(child);
  child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk));
  child.on('error',()=>void shutdown(1));child.on('exit',()=>{if(!stopping)void shutdown(1);});
  child.on('message',message=>{if(message?.kind==='failed')void shutdown(1);if(message?.kind==='ready'){ready.add(role);if(ready.size===2){void(async()=>{const proof={launchId,pid:process.pid,workers:children.map(c=>c.pid),controlPort:config.controlPort,previewPort:config.previewPort};await fs.mkdir(path.dirname(readyFile),{recursive:true});await fs.writeFile(readyFile+'.tmp',JSON.stringify(proof),{flag:'wx'});await fs.rename(readyFile+'.tmp',readyFile);clearTimeout(startupTimer);console.log('COMPANION_DESKTOP_READY '+JSON.stringify(proof));})().catch(()=>void shutdown(1));}}});
 }
 const code=await done;input.close();return code;
}

if(require.main===module){let config;try{config=options(process.argv.slice(2));}catch{console.error('DESKTOP_ARGUMENT_ERROR');process.exit(1);}if(config.worker)void worker(config);else void supervise(config).then(code=>process.exit(code),error=>{console.error(error.code==='EADDRINUSE'?'DESKTOP_PORT_IN_USE: close the existing 4321/4323 services first.':'DESKTOP_START_FAILED');process.exit(1);});}
module.exports={options,available,supervise};
