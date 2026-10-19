import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),source=path.join(root,'.companion/clean-archive-gates'),destination=path.join(root,'docs/verification');
const json=async file=>JSON.parse(await readFile(file,'utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const summary=await json(path.join(source,'summary.json')),head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(summary.status!=='PASS'||summary.head!==head||summary.results.length!==4||summary.results.some(r=>r.status!=='PASS'))throw Error('CURRENT_CLEAN_GATES_REQUIRED');
if(sha(await readFile(path.join(root,'src/styles/shell.css')))!==summary.preservedUserCssHash)throw Error('USER_CSS_CHANGED');
await mkdir(destination,{recursive:true});const artifacts=[];
for(const name of await readdir(source)){const bytes=await readFile(path.join(source,name));await copyFile(path.join(source,name),path.join(destination,name));artifacts.push({file:name,sha256:sha(bytes)});}
const counts={};
for(const phase of ['P1','P2','P3','P4']){const gate=await json(path.join(source,phase+'.json'));if(gate.status!=='PASS')throw Error('GATE_REQUIRED '+phase);const output=await readFile(path.join(source,'P4-'+phase+'.txt'),'utf8');if(!/EXIT_CODE=0/.test(output)||!/ℹ fail 0/.test(output))throw Error('TEST_OUTPUT_REQUIRED '+phase);counts[phase]=Number(/ℹ pass (\d+)/.exec(output)[1]);}
const baseline=await readFile(path.join(source,'P4-baseline-53.txt'),'utf8'),motion=await readFile(path.join(source,'P4-baseline-motion.txt'),'utf8');if(!/ℹ pass 53/.test(baseline)||!/27\/27 PASS/.test(motion)||!/693\/693 PASS/.test(motion))throw Error('BASELINES_REQUIRED');
const pi=await json(path.join(root,'.companion/pi-live-smoke.json')),http=await json(path.join(root,'.companion/dual-origin-smoke.json'));if(pi.status!=='PASS'||http.status!=='PASS'||pi.ssrExecuted!==false)throw Error('LIVE_EVIDENCE_REQUIRED');
await writeFile(path.join(destination,'pi-live-smoke.json'),JSON.stringify(pi,null,2)+'\n');await writeFile(path.join(destination,'dual-origin-smoke.json'),JSON.stringify(http,null,2)+'\n');
const inventory=execFileSync('git',['diff','--name-status','bf61c5b',head],{cwd:root,encoding:'utf8'}).trim().split('\n').map(line=>{const [status,file]=line.split('\t');return {status,file,kind:file.startsWith('scripts/')?'test-or-tool':file.startsWith('src/workbench')?'development-control':file.startsWith('src/')?'website-rendering-contract':file.startsWith('workbench/')?'canonical-data':'configuration-or-documentation'};});
const baseFiles=new Set(execFileSync('git',['ls-tree','-r','--name-only','bf61c5b'],{cwd:root,encoding:'utf8'}).trim().split('\n'));
for(const file of ['scripts/archive-report.mjs','docs/FINAL_COMPLETION_REPORT.md','docs/WORKBENCH_REQUIREMENTS_AUDIT.md',...artifacts.map(a=>'docs/verification/'+a.file),...['manifest.json','change-inventory.json','pi-live-smoke.json','dual-origin-smoke.json'].map(name=>'docs/verification/'+name)])if(!inventory.some(entry=>entry.file===file))inventory.push({status:baseFiles.has(file)?'M':'A',file,kind:file.startsWith('scripts/')?'archive-tool':'verification-or-documentation'});
inventory.sort((a,b)=>a.file.localeCompare(b.file));
if(inventory.some(entry=>entry.file==='src/styles/shell.css'||entry.file.startsWith('.companion/')))throw Error('UNRELATED_OR_LOCAL_FILES_IN_ARCHIVE');
await writeFile(path.join(destination,'change-inventory.json'),JSON.stringify({base:'bf61c5b',verifiedCodeCommit:head,files:inventory},null,2)+'\n');
const manifest={status:'PASS',verifiedCodeCommit:head,releaseTag:'v1.0.0-workbench-ready',node:summary.node,platform:summary.platform,verifiedAt:summary.verifiedAt,phaseTests:counts,newTests:Object.values(counts).reduce((a,b)=>a+b,0),legacyTests:53,motionGroups:27,motionAssertions:693,productionResidue:0,browserAutomation:false,humanBrowserAcceptance:'NOT_RUN',candidateSsr:'static-ast fallback; no verified container backend',codeAct:'fail-closed; no verified backend',preservedUserCssHash:summary.preservedUserCssHash,trackedCssHash:summary.trackedCssHash,approvedPlanSha256:sha(await readFile(path.join(root,'companion-workbench-plan.md'))),approvedXmlSha256:sha(await readFile(path.join(root,'spec/companion-workbench-architecture.spec.xml'))),artifacts};
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const bridge=await readFile(path.join(root,'src/workbench-core/bridge.js'),'utf8'),types=await readFile(path.join(root,'src/workbench-core/objects/types.d.ts'),'utf8'),fixture=await readFile(path.join(root,'src/workbench-core/motion/fixture.js'),'utf8');
const fence=(language,content)=>'```'+language+'\n'+content.trim()+'\n```\n';
const report=[
'# Companion Workbench P1–P4 最终自验报告',
'### [STAGE_STATUS]',
'P1 / P2 / P3 / P4：自动化交付 PASS。浏览器人工验收未执行，留给外部架构师；本任务未使用 Computer Use。',
`干净归档所验证的代码提交：\`${head}\`；Node ${summary.node} / ${summary.platform}；完成时间 ${summary.verifiedAt}。最终归档使用附注标签 \`v1.0.0-workbench-ready\`。归档提交仅增加文档、证据与归档脚本，运行代码与该验证提交一致。`,
'分工：主 Agent 完成实现、审计、集成与回归；实际 Pi 1.3.0 子进程验证 Modify / Analyze / Explain。没有以模拟调用冒充真实模型，也没有将 Pi 的提案直接写入业务源码。',
'精确新增/修改文件清单见 [change-inventory.json](verification/change-inventory.json)。运行核心集中于 `src/workbench-core/`、`src/workbench-server/`、`src/workbench/`；业务变更仅为 Newsletter 共用渲染契约（`src/lib/reader-contract.js`、`src/components/ReaderNodes.astro`、`src/pages/newsletter.astro`、`src/scripts/newsletter.js`）。未提交、未覆盖用户的 `src/styles/shell.css`。',
'| 阶段 | 新增模块 / 关键契约 | 独立测试通过 |',
'| --- | --- | --- |',
`| P1 | objects/spec/graph/anchors；bridge/bridge-session；view-stack；motion/fixture；控制面、严格 Mermaid 与对象树缩略图 | ${counts.P1}/${counts.P1} |`,
`| P2 | geometry/spatial-measure；changes/structure；registry-plan；preview/backend；append-only journal、CAS、签名批准、逆事务 Undo | ${counts.P2}/${counts.P2} |`,
`| P3 | sync/spec-service；reader-contract + ReaderNodes；pi-adapter/agent-context/agent-service；证据约束及三方合并 | ${counts.P3}/${counts.P3} |`,
`| P4 | auth/security-api；event-log；memory/typed slots/SQLite FTS5；sandbox；多用户 HTTP 与注册表权威校验 | ${counts.P4}/${counts.P4} |`,
'### [REPO_AND_TOPOLOGY_VERIFICATION]',
'`workbench/objects/`、`workbench/specs/` 已版本控制；`.companion/` 已忽略。根目录主稿与 `spec/` 评审 XML 是逐字节归档输入，运行时唯一可编辑 Spec 为 `workbench/specs/ivorg.spec.xml`。注册表偏离当前 Spec 或引入 Spec 未定义身份会被拒绝。',
`主稿 SHA-256：\`${manifest.approvedPlanSha256}\`。评审 XML SHA-256：\`${manifest.approvedXmlSha256}\`。`,
'完整示例实际为104个身份：3 PageObject、5 ComponentObject、4 TransitionObject、5 Definition、2 示例 Instance；包含15个启用 Binding及1个禁用自绑定。HOME↔NEWSLETTER 导航环合法；继承和包含均执行三色 DFS，包括解析后的继承包含图。参数覆写验证类型/范围/锁，未知字段拒绝。',
'拓扑将 TransitionBinding 实体化为中间节点，15个绑定对应30条分段连线；另有4条阅读顺序邻接。`td.wipeCover` 实际复用数为12，四个明确例子是 `bnd.home.cta.discography`、`bnd.home.cta.newsletter`、`bnd.home.poster.feature`、`bnd.home.poster.bulletin`。HOME→DISCO的三个页面局部入口为 cta.discography、poster.feature、poster.bulletin。',
'4323控制面与4321只读预览的实际 HTTP 验证通过，三页返回200，本地 Mermaid 包可读取，旧写RPC及伪造Origin返回403。正式工作台已在交付机器启动；本机PID与地址见 `.companion/runtime.json`。后续设备执行 `npm run dev:workbench`；端口占用会拒绝启动。证据：[dual-origin-smoke.json](verification/dual-origin-smoke.json)。',
'### [TEST_OUTPUT]',
`四阶段在 Git HEAD 的干净归档中按 P1→P4 顺序分别执行完整门禁，全部退出码0；独立新增测试共${manifest.newTests}项。每轮均重新构建、扫描全部生产文件，并执行53/53旧测试和27/27组、693/693条MotionBaker断言。`,
'完整终端输出（保留退出码、通过数及断言数，不截取失败历史充当最终结果）：',
'- [P1](verification/P4-P1.txt) / [P2](verification/P4-P2.txt) / [P3](verification/P4-P3.txt) / [P4](verification/P4-P4.txt)。',
'- [53项旧基线](verification/P4-baseline-53.txt) / [27组693条断言](verification/P4-baseline-motion.txt)。',
'- [生产构建](verification/P4-build.txt) / [全部产物零残留扫描](verification/P4-production-residue.txt) / [桥静态安全断言](verification/P4-bridge-static.txt)。',
'- [干净归档总表](verification/summary.json) / [四轮运行输出 P1](verification/P1-runner.txt)、[P2](verification/P2-runner.txt)、[P3](verification/P3-runner.txt)、[P4](verification/P4-runner.txt)。',
'真实断言覆盖：实际进程在rename前/中/后退出恢复；foreign hash只读且不覆写；跨文件Undo逐字节一致；真实AST/Spec三栏冲突；真实Astro SSR与DOM CSR三期正文文本/href奇偶；真实Pi三能力及临时副本Apply/Undo；实际GSAP工厂五个时间点clip-path/xPercent误差≤1e-3；真实Cookie/CSRF/角色/草稿隔离；实际FTS5触发器/重建；沙箱输入junction越界、可信传输夹具超时/输出上限与后端缺失拒绝。',
'安全静态扫描覆盖控制面、服务端、core及桥：无父页DOM读取、两个postMessage均固定目标、无Fixture导航调用。生产扫描覆盖dist全部17个文件，无开发标记、控制面脚本、RPC路径或已知凭据。SQLite experimental warning 已保留，不作为失败隐藏。',
'真实Pi证据：[pi-live-smoke.json](verification/pi-live-smoke.json)。其候选预览明确为static-ast，ssrExecuted=false；COMMITTED后Undo字节一致，原仓库业务文件未被模型改动。',
'### [KEY_CODE_AND_CONTRACT]',
'对象类型（实际源码）：',fence('ts',types),
'Session局部RNG与独立poster deck（实际源码）：',fence('js',fixture.slice(fixture.indexOf('export function mulberry32'),fixture.indexOf('export function canonical'))),
'Session身份生成（实际源码，instanceSeq只在该Session成功烘焙后递增）：',fence('js',fixture.slice(fixture.indexOf('      instanceSeq++;'),fixture.indexOf('      artifact = Object.freeze'))),
'完整PreviewBridge闭合消息校验（实际源码；包含origin/source/schema/epoch/nonce/docRevision和选区形状校验）：',fence('js',bridge),
'其余写入与授权契约：fresh remeasure requestId、1px误差和当前源码哈希共同约束空间操作；插入使用UTF-16、closingElement.start及新AST remap；Spec新增身份、Astro和registry在同一追加式Journal事务内发布；批准绑定摘要/基线/actor/policy/到期时间且仅可使用一次；Undo使用当前afterHash的逆事务。授权与写入只读取当前磁盘事实，不使用记忆检索结果。',
'L2优先级为 instance > binding > definition > project > user，继承锁不可覆写；选中Binding/Definition会确定性注入对应槽。Pi按用户独立session-dir，LF拆帧、id关联、先订阅后prompt、持续消费、settled判定与背压；源码证据缺失/路径伪造/过期上下文拒绝。配额恢复前复核Git、Spec和全项目源码哈希。',
'边界如实保留：候选SSR只有经核验的强隔离镜像才执行；本机使用明确需确认的静态AST/结构Diff降级。CodeAct因无可验证后端而fail-closed，未宣称实际容器网络/挂载隔离已验证。对未知意图、任意表达式/数据结构/绑定迁移等越界修改，返回显式规划、澄清或拒绝，不进行全文覆盖。平台级Codex中断不能由本地代码保证自动唤醒。',
`用户CSS保留哈希：\`${summary.preservedUserCssHash}\`；干净标签代码CSS哈希：\`${summary.trackedCssHash}\`。两者不同是有意保留用户未提交改动，门禁以干净归档为准。`,
'详细运行与边界见 [WORKBENCH_PIPELINE.md](WORKBENCH_PIPELINE.md)，机器可读记录见 [manifest.json](verification/manifest.json)。',
'### [MANUAL_VERIFICATION_STEPS]',
'以下三项待外部人工执行；未冒充自动浏览器验收：',
'1. 访问 http://127.0.0.1:4323，用本机 `.companion/auth/bootstrap-owner.txt` 的初始账户登录；在宏观卡片及展开的严格 Mermaid 图中选中独立TransitionBinding中间节点，核对共享定义和三个HOME→DISCO入口。',
'2. 先设置宏观zoom/pan，再下钻时间轴，拖帧、seek、reroll、实时归一化对比；记录4321预览路由，确认烘焙不切页，点击返回核对zoom/pan/scroll/selection恢复。',
'3. 预览Alt+S框选空白，审阅ChangePlan和Before/After Diff；若为静态降级，明确确认后Apply。等待刷新并重新选中对应区域，再Undo核对还原；切换第二账户核对私有草稿/权限和CodeAct关闭原因。',
'P1–P4实施与自动化验证完毕，已停止开发修改，等待外部架构师最终复核。工作台本地服务保持运行供验收。'
];
await writeFile(path.join(root,'docs/FINAL_COMPLETION_REPORT.md'),report.join('\n\n').replace(/(\|[^\n]*)\n\n(?=\|)/g,'$1\n')+'\n');
const audit=['# Companion Workbench 最终逐项自验','设计权威：`../companion-workbench-plan.md`。全部自动化门禁通过，证据与限制详见 [最终报告](FINAL_COMPLETION_REPORT.md)。','| 要求 | 实现 / 可执行证据 |','| --- | --- |',
...[
['P1 唯一Spec、稳定身份、继承/包含环','spec-l1 / anchor / topology / object-contract / registry-identity；注册表漂移拒绝'],
['P1 双Origin只读桥、宏观下钻与视口恢复','bridge-session / workbench-p1 / topology-renderer；真实4323/4321 HTTP smoke'],
['P1 Session RNG、deck、确定性及实时数值对比','fixture / fixture-alignment；真实GSAP五个时间点≤1e-3；明确排除视差'],
['P2 全空间、网格/邻居、fresh 1px重测','geometry / spatial-measure / preview-http / multi-user；HMR DOM版本及凭据剥离'],
['P2 typed ops、格式、UTF-16、remap与身份登记','insert / remap / registry-identity / spec-service结构新增事务'],
['P2 隔离预览、批准、Journal、崩溃恢复与Undo','preview-safety / approval / journal / undo / change-api；静态降级需明确确认'],
['P3 完整XML L1/L2/L3、Spec↔AST及冲突','spec-l3 / object-contract / sync / merge / spec-service；散文不直接改代码'],
['P3 Newsletter正文同一渲染契约','parity：三期真实SSR与DOM CSR文本/href逐项相等，无innerHTML'],
['P3 Pi三能力、RPC、证据上下文与恢复事实','pi-adapter / agent-context；实际Pi三能力及临时副本Apply/Undo'],
['P4 角色/账户/会话/CSRF及多用户范围','authz（14个显式负向案例及会话/角色测试）/ multi-user真实HTTP'],
['P4 append-only日志、槽与派生FTS5','eventlog / slots / memory；死writer、脱敏、优先级、锁、重建、supersession、陈旧隔离'],
['P4 CodeAct强隔离或fail-closed','sandbox：hash/路径/junction/跨用户/网络和写入策略拒绝，真实传输超时与输出限制；本机后端缺失拒绝执行'],
['四阶段生产零残留、旧基线与干净归档','四轮build+全dist扫描；53/53和27/27·693；用户CSS哈希未变'],
['人工浏览器与实际容器执行','NOT_RUN：禁止Computer Use；无验证容器后端。均明确保留边界，不伪称已验收']
].map(([a,b])=>`| ${a} | ${b} |`)];
await writeFile(path.join(root,'docs/WORKBENCH_REQUIREMENTS_AUDIT.md'),audit.join('\n\n').replace(/(\|[^\n]*)\n\n(?=\|)/g,'$1\n')+'\n');
console.log('ARCHIVE_REPORT_READY',JSON.stringify({verifiedCodeCommit:head,counts,newTests:manifest.newTests,artifactFiles:artifacts.length}));
