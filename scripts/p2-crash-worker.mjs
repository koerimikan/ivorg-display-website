import {createJournal} from '../src/workbench-server/journal.js';
import {hash} from '../src/workbench-core/objects/spec.js';
const [root,point]=process.argv.slice(2),actor={userId:'test',role:'owner'};
const changes=[1,2].map(i=>({file:`src/pages/p${i}.astro`,before:'<p>old</p>',after:'<p>new</p>',beforeHash:hash('<p>old</p>'),afterHash:hash('<p>new</p>')}));
const plan={changes,baseRevisions:Object.fromEntries(changes.map(c=>[c.file,c.beforeHash])),patchDigest:hash(JSON.stringify(changes.map(c=>[c.file,c.afterHash])))};
const journal=createJournal({root,secret:'test',crashAt(stage,j,i){if(point==='prepared'&&stage==='prepared'||point==='middle'&&stage==='afterRename'&&i===0||point==='last'&&stage==='afterRename'&&i===1)process.exit(87);}});
await journal.transact(plan,journal.approve(plan,actor),actor);
