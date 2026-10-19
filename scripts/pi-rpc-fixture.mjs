import {once} from 'node:events';
let buffer='';const mode=process.argv[2];const send=async record=>{if(!process.stdout.write(JSON.stringify(record)+'\n'))await once(process.stdout,'drain');};
process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);void handle(JSON.parse(line));}});
async function handle(command){if(command.type==='abort'){await send({id:command.id,type:'response',success:true,data:{}});await send({type:'agent_settled',aborted:true});return;}if(command.type!=='prompt'){setTimeout(()=>void send({id:command.id,type:'response',success:true,data:{name:command.name}}),command.delay||0);return;}
  if(mode==='noack')return;
  if(mode==='bad'){process.stdout.write('bad\nbad\nbad\nbad\nbad\n');return;}
  await send({id:command.id,type:'response',command:'prompt',success:true,data:{disposition:mode==='handled'?'handled':'started'}});
  if(mode==='handled'||mode==='timeout'||mode==='cancel')return;
  if(mode==='crash')process.exit(7);
  if(mode==='unicode'){const bytes=Buffer.from(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'甲\u2028乙😀'}]}})+'\n');for(let i=0;i<bytes.length;i++)process.stdout.write(bytes.subarray(i,i+1));}
  if(mode==='burst')for(let i=0;i<2000;i++)await send({type:'message_update',seq:i});
  if(mode==='quota')await send({type:'message_end',message:{role:'assistant',errorMessage:'429 Rate limit reached; reset in 2 minutes'}});
  if(mode==='recovered'){await send({type:'auto_retry_start',errorMessage:'429 Rate limit reached'});await send({type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'429 temporary quota'}});await send({type:'auto_retry_end',success:true});await send({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'recovered'}]}});}
  if(mode==='finalQuota')await send({type:'auto_retry_end',success:false,finalError:'429 Quota exhausted; reset in 5 hours'});
  await send({type:'agent_end'});setTimeout(()=>void send({type:'agent_settled',aborted:mode==='aborted'}),25);
}
