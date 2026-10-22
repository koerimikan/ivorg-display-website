// Legacy recording UI depends on an explicitly supplied host animation adapter.
let adapter=null;
export function registerHostMotion(value){
 const names=['createEntranceTimeline','createWipeTimeline','createDecodeDriver','pickPoster','stopLiveEntrance','stopLiveWipe'];
 if(!value||names.some(name=>typeof value[name]!=='function'))throw Error('HOST_MOTION_CONTRACT');
 adapter=Object.fromEntries(names.map(name=>[name,value[name]]));
 return ()=>{adapter=null;};
}
function call(name,args){if(!adapter)throw Error('HOST_MOTION_UNBOUND');return adapter[name](...args);}
export const createEntranceTimeline=(...args)=>call('createEntranceTimeline',args);
export const createWipeTimeline=(...args)=>call('createWipeTimeline',args);
export const createDecodeDriver=(...args)=>call('createDecodeDriver',args);
export const pickPoster=(...args)=>call('pickPoster',args);
export const stopLiveEntrance=(...args)=>adapter?.stopLiveEntrance(...args);
export const stopLiveWipe=(...args)=>adapter?.stopLiveWipe(...args);
