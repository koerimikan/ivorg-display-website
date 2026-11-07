// Change the <Text> of one canonical Spec node through Atelier's own pipeline:
// specService.plan (Spec diff -> AST ops + registry projection) -> isolated
// dryRun -> signed approval -> journal.transact (per-file CAS + Journal).
// Without --apply it only prints the plan and dry-run result.
// Usage: node scripts/spec-text-change.mjs --object <nodeId> --text <new text> [--project <host>] [--apply]
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { specService } from '../packages/atelier/src/workbench-server/spec-service.js';
import { createJournal, dryRun } from '../packages/atelier/src/workbench-server/journal.js';
import { serializeSpec } from '../packages/atelier/src/workbench-core/sync.js';
import { validateSpec } from '../packages/atelier/src/workbench-core/objects/l3.js';
import { unifiedDiff } from '../packages/atelier/src/workbench-server/preview.js';

const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const objectId = arg('--object'), text = arg('--text');
if (!objectId || typeof text !== 'string') { console.error('Usage: --object <nodeId> --text <new text> [--apply]'); process.exit(2); }
const root = path.resolve(arg('--project') || fileURLToPath(new URL('../apps/ivorg-website/', import.meta.url)));

const service = specService(root);
const current = await service.read();
const tree = validateSpec(current.spec).tree;
let node = null;
(function find(n) { if (n.attrs?.id === objectId) node = n; else n.children?.forEach(find); })(tree);
if (!node) { console.error('OBJECT_NOT_FOUND ' + objectId); process.exit(1); }
const textChild = node.children.find(c => c.tag === 'Text');
if (!textChild) { console.error('NO_TEXT_CHILD ' + objectId); process.exit(1); }
if (textChild.text === text) { console.log('NO_CHANGE'); process.exit(0); }
textChild.text = text;

const result = await service.plan(serializeSpec(tree));
console.log('VERDICT ' + result.proposal.verdict + ' ops=' + (result.writePlan?.ops?.length ?? 0) + ' blockers=' + JSON.stringify(result.proposal.blockers || []));
if (!result.writePlan || ['blocked', 'needsPlan'].includes(result.proposal.verdict)) process.exit(1);
for (const change of result.writePlan.changes) console.log('FILE ' + change.file + (change.canonical ? ' (canonical)' : ''));
const sourceChanges = result.writePlan.changes.filter(c => !c.canonical);
for (const c of sourceChanges) console.log(unifiedDiff(c.before, c.after, c.file));

const preview = await dryRun(root, result.writePlan).catch(error => ({ error: error.code || error.message }));
console.log('DRY_RUN ' + JSON.stringify({ ok: !preview.error, error: preview.error, mode: preview.mode, ssrExecuted: preview.ssrExecuted }));
if (preview.error) process.exit(1);
if (!args.includes('--apply')) { console.log('DRY_RUN_ONLY (pass --apply to commit through the Journal)'); process.exit(0); }

const actor = { userId: 'cli-owner', role: 'owner' };
const journal = createJournal({ root, secret: randomBytes(32).toString('hex') });
const tx = await journal.transact(result.writePlan, journal.approve(result.writePlan, actor), actor);
console.log('COMMITTED ' + tx.id + ' state=' + tx.state + ' files=' + tx.files.map(f => f.file).join(','));
