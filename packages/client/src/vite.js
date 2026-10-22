import {sourceManifest} from '@atelier/workbench/server/project-source.js';
export default function atelier({routes={},enabled=true}={}){
 let root;
 return {name:'atelier-client',apply:'serve',
  configResolved(config){root=config.root;if(enabled&&config.server.host!=='127.0.0.1')throw Error('ATELIER_LOOPBACK_REQUIRED');},
  transformIndexHtml:{order:'pre',async handler(){if(!enabled)return [];const state=await sourceManifest(root);return [
   {tag:'meta',attrs:{name:'cw-preview-revision',content:state.docRevision},injectTo:'head'},
   {tag:'script',attrs:{type:'module'},children:`globalThis.__ATELIER_HOST__=${JSON.stringify({routes}).replaceAll('<','\\u003c')};import '@atelier/client';`,injectTo:'body'}
  ];}},
  configureServer(server){if(!enabled)return;server.middlewares.use(async(req,res,next)=>{
   delete req.headers.cookie;delete req.headers.authorization;
   if(req.url?.split('?')[0]!=='/__companion/preview-state')return next();
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   if(req.method!=='GET'){res.statusCode=405;res.end('{}');return;}
   try{res.end(JSON.stringify({...await sourceManifest(root),readOnly:true,sourceMapping:false,transactionPending:false}));}
   catch{res.statusCode=500;res.end('{"error":"PREVIEW_STATE_UNAVAILABLE"}');}
  });},
  handleHotUpdate(context){if(enabled){context.server.ws.send({type:'full-reload'});return [];}}
 };
}
