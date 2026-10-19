# Companion Workbench P1–P4 最终自验报告

### [STAGE_STATUS]

P1 / P2 / P3 / P4：自动化交付 PASS。浏览器人工验收未执行，留给外部架构师；本任务未使用 Computer Use。

干净归档所验证的代码提交：`12c0cda868ccc74100639691b8470e2333ea0b72`；Node v22.21.0 / win32；完成时间 2026-10-19T21:10:06.020Z。最终归档使用附注标签 `v1.0.0-workbench-ready`。归档提交仅增加文档、证据与归档脚本，运行代码与该验证提交一致。

分工：主 Agent 完成实现、审计、集成与回归；实际 Pi 1.3.0 子进程验证 Modify / Analyze / Explain。没有以模拟调用冒充真实模型，也没有将 Pi 的提案直接写入业务源码。

精确新增/修改文件清单见 [change-inventory.json](verification/change-inventory.json)。运行核心集中于 `src/workbench-core/`、`src/workbench-server/`、`src/workbench/`；业务变更仅为 Newsletter 共用渲染契约（`src/lib/reader-contract.js`、`src/components/ReaderNodes.astro`、`src/pages/newsletter.astro`、`src/scripts/newsletter.js`）。未提交、未覆盖用户的 `src/styles/shell.css`。

| 阶段 | 新增模块 / 关键契约 | 独立测试通过 |
| --- | --- | --- |
| P1 | objects/spec/graph/anchors；bridge/bridge-session；view-stack；motion/fixture；控制面、严格 Mermaid 与对象树缩略图 | 30/30 |
| P2 | geometry/spatial-measure；changes/structure；registry-plan；preview/backend；append-only journal、CAS、签名批准、逆事务 Undo | 31/31 |
| P3 | sync/spec-service；reader-contract + ReaderNodes；pi-adapter/agent-context/agent-service；证据约束及三方合并 | 33/33 |
| P4 | auth/security-api；event-log；memory/typed slots/SQLite FTS5；sandbox；多用户 HTTP 与注册表权威校验 | 32/32 |

### [REPO_AND_TOPOLOGY_VERIFICATION]

`workbench/objects/`、`workbench/specs/` 已版本控制；`.companion/` 已忽略。根目录主稿与 `spec/` 评审 XML 是逐字节归档输入，运行时唯一可编辑 Spec 为 `workbench/specs/ivorg.spec.xml`。注册表偏离当前 Spec 或引入 Spec 未定义身份会被拒绝。

主稿 SHA-256：`dd808b6626c94f1a97981764947c032be5e8922a2aa4a2228d62400650b359f0`。评审 XML SHA-256：`c9306dc9ae2fe43680f0a10adc8a231f413413bbfc4c6c4032effc4c78ffdbab`。

完整示例实际为104个身份：3 PageObject、5 ComponentObject、4 TransitionObject、5 Definition、2 示例 Instance；包含15个启用 Binding及1个禁用自绑定。HOME↔NEWSLETTER 导航环合法；继承和包含均执行三色 DFS，包括解析后的继承包含图。参数覆写验证类型/范围/锁，未知字段拒绝。

拓扑将 TransitionBinding 实体化为中间节点，15个绑定对应30条分段连线；另有4条阅读顺序邻接。`td.wipeCover` 实际复用数为12，四个明确例子是 `bnd.home.cta.discography`、`bnd.home.cta.newsletter`、`bnd.home.poster.feature`、`bnd.home.poster.bulletin`。HOME→DISCO的三个页面局部入口为 cta.discography、poster.feature、poster.bulletin。

4323控制面与4321只读预览的实际 HTTP 验证通过，三页返回200，本地 Mermaid 包可读取，旧写RPC及伪造Origin返回403。正式工作台已在交付机器启动；本机PID与地址见 `.companion/runtime.json`。后续设备执行 `npm run dev:workbench`；端口占用会拒绝启动。证据：[dual-origin-smoke.json](verification/dual-origin-smoke.json)。

### [TEST_OUTPUT]

四阶段在 Git HEAD 的干净归档中按 P1→P4 顺序分别执行完整门禁，全部退出码0；独立新增测试共126项。每轮均重新构建、扫描全部生产文件，并执行53/53旧测试和27/27组、693/693条MotionBaker断言。

完整终端输出（保留退出码、通过数及断言数，不截取失败历史充当最终结果）：

- [P1](verification/P4-P1.txt) / [P2](verification/P4-P2.txt) / [P3](verification/P4-P3.txt) / [P4](verification/P4-P4.txt)。

- [53项旧基线](verification/P4-baseline-53.txt) / [27组693条断言](verification/P4-baseline-motion.txt)。

- [生产构建](verification/P4-build.txt) / [全部产物零残留扫描](verification/P4-production-residue.txt) / [桥静态安全断言](verification/P4-bridge-static.txt)。

- [干净归档总表](verification/summary.json) / [四轮运行输出 P1](verification/P1-runner.txt)、[P2](verification/P2-runner.txt)、[P3](verification/P3-runner.txt)、[P4](verification/P4-runner.txt)。

真实断言覆盖：实际进程在rename前/中/后退出恢复；foreign hash只读且不覆写；跨文件Undo逐字节一致；真实AST/Spec三栏冲突；真实Astro SSR与DOM CSR三期正文文本/href奇偶；真实Pi三能力及临时副本Apply/Undo；实际GSAP工厂五个时间点clip-path/xPercent误差≤1e-3；真实Cookie/CSRF/角色/草稿隔离；实际FTS5触发器/重建；沙箱输入junction越界、可信传输夹具超时/输出上限与后端缺失拒绝。

安全静态扫描覆盖控制面、服务端、core及桥：无父页DOM读取、两个postMessage均固定目标、无Fixture导航调用。生产扫描覆盖dist全部17个文件，无开发标记、控制面脚本、RPC路径或已知凭据。SQLite experimental warning 已保留，不作为失败隐藏。

真实Pi证据：[pi-live-smoke.json](verification/pi-live-smoke.json)。其候选预览明确为static-ast，ssrExecuted=false；COMMITTED后Undo字节一致，原仓库业务文件未被模型改动。

### [KEY_CODE_AND_CONTRACT]

对象类型（实际源码）：

```ts
export interface TransitionBinding {
  objectId: string;
  type: 'TransitionBinding';
  transitionObjectId: string;
  fields: {
    id: string; fromPage: string; toPage: string; definitionRef: string;
    linkRef?: string;
    trigger: 'click' | 'wheel' | 'touch' | 'pageLoad' | 'componentEvent';
    effect: 'cover' | 'uncover' | 'inPlace' | 'none';
    enabled: 'true' | 'false'; deckCursor?: string; guard?: string;
  };
}
export interface TransitionInstance {
  readonly instanceId: string;
  readonly sessionId: string;
  readonly instanceSeq: number;
  readonly bindingRef: string;
  readonly definitionRef: string;
  readonly deckCursorAtStart: number;
  readonly recordedBy: 'fixture';
}
export interface ReadOnlyActor {
  readonly userId: 'local-owner';
  readonly projectId: string;
  readonly sessionId: string;
  readonly scope: 'project-read-only';
  readonly capabilities: readonly ['analyze', 'explain', 'measure'];
  readonly authenticatedBy: 'trusted-loopback-p1';
}
export interface WorkbenchEvent {
  seq: number; kind: string; actorUserId: string; projectId: string; sessionId: string;
}
```


Session局部RNG与独立poster deck（实际源码）：

```js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPosterDeck(seed, count = 4) {
  if (!Number.isInteger(count) || count < 1 || count > 128) throw new RangeError('Invalid deck size');
  const rng = mulberry32(seed); let deck = [], cursor = 0, last = -1, draws = 0;
  return {
    next() {
      if (cursor === deck.length) {
        deck = Array.from({ length: count }, (_, i) => i);
        for (let i = count - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        if (count > 1 && deck[0] === last) [deck[0], deck[1]] = [deck[1], deck[0]];
        cursor = 0;
      }
      last = deck[cursor++]; draws++; return last;
    },
    get cursor() { return draws; }
  };
}
```


Session身份生成（实际源码，instanceSeq只在该Session成功烘焙后递增）：

```js
instanceSeq++;
      const instance = Object.freeze({ instanceId: `ti.${sessionId}.${instanceSeq}`, sessionId, instanceSeq,
        bindingRef: binding.objectId, definitionRef: definition.objectId, deckCursorAtStart, recordedBy: 'fixture' });
```


完整PreviewBridge闭合消息校验（实际源码；包含origin/source/schema/epoch/nonce/docRevision和选区形状校验）：

```js
import { sanitizeSnapshot } from '../dev-studio/task-proposal.js';
export const CONTROL_ORIGIN = 'http://127.0.0.1:4323';
export const PREVIEW_ORIGIN = 'http://127.0.0.1:4321';
const noncePattern = /^[a-f0-9-]{32,64}$/i;
const digestPattern = /^[a-f0-9]{64}$/;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
const routeOK = value => typeof value === 'string' && /^\/(?!\/)[^\s?#]*$/.test(value) && value.length <= 256;
const idsOK = value => Array.isArray(value) && value.length <= 80 && value.every(id => typeof id === 'string' && id.length <= 160);
const rectOK = value => keys(value,['x','y','width','height']) && ['x','y','width','height'].every(key=>finite(value[key])) && value.width >= 0 && value.height >= 0;
const pointOK = value => keys(value,['x','y']) && finite(value.x) && finite(value.y);
const headerOK = (ev,parent) => ev.origin === CONTROL_ORIGIN && ev.source === parent && ev.data?.schemaVersion === 1 && Number.isSafeInteger(ev.data.frameEpoch) && ev.data.frameEpoch > 0 && noncePattern.test(ev.data.sessionNonce);
export function isBridgeInit(ev,parent) { return headerOK(ev,parent) && ev.data.kind === 'init' && keys(ev.data,['schemaVersion','kind','frameEpoch','sessionNonce']); }
export function isRemeasureRequest(ev,parent,context) { return headerOK(ev,parent) && ev.data.kind === 'remeasure' && keys(ev.data,['schemaVersion','kind','frameEpoch','sessionNonce','requestId']) && ev.data.frameEpoch === context?.frameEpoch && ev.data.sessionNonce === context?.sessionNonce && noncePattern.test(ev.data.requestId); }
function spatialOK(s,selection,message) {
  if(!keys(s,['selectionId','raw','rects','normalized','nonInvertible','frames','frameEpoch','sourceRevisions','objectIds','runtimeSourceIds','mode','geometryFingerprint']) || s.selectionId!==selection.selectionId || s.frameEpoch!==message.frameEpoch || !digestPattern.test(s.geometryFingerprint) || !keys(s.sourceRevisions,['project']) || s.sourceRevisions.project!==message.docRevision || typeof s.nonInvertible!=='boolean' || !idsOK(s.objectIds) || !idsOK(s.runtimeSourceIds) || !['pick','box','lasso','empty'].includes(s.mode))return false;
  if(!keys(s.rects,['viewport','document','container','canvas']) || !['viewport','document','canvas'].every(key=>rectOK(s.rects[key])) || s.rects.container!==undefined&&!rectOK(s.rects.container))return false;
  if(s.normalized!==null&&!rectOK(s.normalized))return false;
  if(!keys(s.raw,['kind','rect','polygon']) || !(s.raw.kind==='rect'?rectOK(s.raw.rect):s.raw.kind==='polygon'&&Array.isArray(s.raw.polygon)&&s.raw.polygon.length>=3&&s.raw.polygon.length<=1024&&s.raw.polygon.every(pointOK)))return false;
  if(!Array.isArray(s.frames)||s.frames.length!==4)return false;
  const spaces=new Set();for(const frame of s.frames){if(!keys(frame,['space','matrix','denominator','scroll','frameZoom','dpr'])||!['viewport','document','container','canvas'].includes(frame.space)||spaces.has(frame.space)||!Array.isArray(frame.matrix)||frame.matrix.length!==6||!frame.matrix.every(finite)||!['content-box','canvas-px'].includes(frame.denominator)||!pointOK(frame.scroll)||!finite(frame.frameZoom)||frame.frameZoom<=0||!finite(frame.dpr)||frame.dpr<=0)return false;spaces.add(frame.space);}
  return ['x','y','width','height'].every(key=>s.rects.viewport[key]===selection.rect[key]);
}
function selectionOK(s,message) {
  if(!keys(s,['selectionId','rect','parentSourceId','frameEpoch','docRevision','layoutFacts','normalized','grid','neighbors','spatial','sampledAt'])||typeof s.selectionId!=='string'||!s.selectionId.length||s.selectionId.length>64||typeof s.parentSourceId!=='string'||s.parentSourceId.length>160||s.frameEpoch!==message.frameEpoch||s.docRevision!==message.docRevision||!rectOK(s.rect))return false;
  if(!keys(s.layoutFacts,['writingMode','ancestorRotate','animationInFlight','dense','overflowClip','fontsReady'])||typeof s.layoutFacts.writingMode!=='string'||s.layoutFacts.writingMode.length>32||['ancestorRotate','animationInFlight','dense','overflowClip'].some(key=>typeof s.layoutFacts[key]!=='boolean')||s.layoutFacts.fontsReady!==undefined&&typeof s.layoutFacts.fontsReady!=='boolean')return false;
  if(s.normalized!==undefined&&s.normalized!==null&&!rectOK(s.normalized))return false;
  if(s.grid&&(!keys(s.grid,['columns','rows','confidence','appendOnly','reasons'])||!finite(s.grid.confidence)||s.grid.confidence<0||s.grid.confidence>1||!['columns','rows'].every(key=>Array.isArray(s.grid[key])&&s.grid[key].length<=80&&s.grid[key].every(value=>Number.isSafeInteger(value)&&value>0))||s.grid.appendOnly!==undefined&&typeof s.grid.appendOnly!=='boolean'||s.grid.reasons!==undefined&&(!Array.isArray(s.grid.reasons)||s.grid.reasons.length>8||s.grid.reasons.some(reason=>typeof reason!=='string'||reason.length>240))))return false;
  if(s.neighbors&&(!keys(s.neighbors,['up','down','left','right'])||Object.values(s.neighbors).some(value=>value!==null&&(typeof value!=='string'||value.length>160))))return false;
  if(s.sampledAt!==undefined&&(!Number.isFinite(s.sampledAt)||s.sampledAt<0))return false;
  return s.spatial===undefined||spatialOK(s.spatial,s,message);
}
export function acceptBridgeMessage(ev,expect) {
  if(ev.origin!==expect.origin)return {reject:'ORIGIN'};
  if(ev.source!==expect.source)return {reject:'SOURCE'};
  const d=ev.data;
  if(!object(d)||d.schemaVersion!==1)return {reject:'SCHEMA'};
  if(!Number.isSafeInteger(d.frameEpoch)||d.frameEpoch!==expect.frameEpoch)return {reject:'EPOCH'};
  if(!noncePattern.test(d.sessionNonce)||d.sessionNonce!==expect.nonce)return {reject:'NONCE'};
  if(!digestPattern.test(d.docRevision))return {reject:'SHAPE'};
  if(expect.docRevision&&d.docRevision!==expect.docRevision)return {reject:'STALE_DOC'};
  const extra={hello:['pathname'],measure:['pathname','rects','hitIds','runtimeSourceIds','selection','capture','requestId'],route:['pathname','navigationType'],geometry:['geometryFingerprint','breakpointKey','fontsReady'],error:['code','detail','requestId']}[d.kind];
  if(!extra||!keys(d,['schemaVersion','kind','frameEpoch','sessionNonce','docRevision',...extra]))return {reject:'SHAPE'};
  if(!['error','geometry'].includes(d.kind)&&!routeOK(d.pathname))return {reject:'SHAPE'};
  if(d.requestId!==undefined&&!noncePattern.test(d.requestId))return {reject:'SHAPE'};
  if(d.kind==='measure'){
    if(!Array.isArray(d.rects)||d.rects.length>80||!d.rects.every(rectOK)||!idsOK(d.hitIds)||!idsOK(d.runtimeSourceIds)||d.selection!==undefined&&!selectionOK(d.selection,d))return {reject:'SHAPE'};
    if(d.capture!==undefined){try{return {...d,capture:sanitizeSnapshot(d.capture)};}catch{return {reject:'SHAPE'};}}
  }
  if(d.kind==='geometry'&&(!digestPattern.test(d.geometryFingerprint)||typeof d.breakpointKey!=='string'||d.breakpointKey.length>64||typeof d.fontsReady!=='boolean'))return {reject:'SHAPE'};
  if(d.kind==='route'&&d.navigationType!==undefined&&!['push','replace','traverse','load'].includes(d.navigationType))return {reject:'SHAPE'};
  if(d.kind==='error'&&(typeof d.code!=='string'||d.code.length>64||typeof d.detail!=='string'||d.detail.length>512))return {reject:'SHAPE'};
  return d;
}
```


其余写入与授权契约：fresh remeasure requestId、1px误差和当前源码哈希共同约束空间操作；插入使用UTF-16、closingElement.start及新AST remap；Spec新增身份、Astro和registry在同一追加式Journal事务内发布；批准绑定摘要/基线/actor/policy/到期时间且仅可使用一次；Undo使用当前afterHash的逆事务。授权与写入只读取当前磁盘事实，不使用记忆检索结果。

L2优先级为 instance > binding > definition > project > user，继承锁不可覆写；选中Binding/Definition会确定性注入对应槽。Pi按用户独立session-dir，LF拆帧、id关联、先订阅后prompt、持续消费、settled判定与背压；源码证据缺失/路径伪造/过期上下文拒绝。配额恢复前复核Git、Spec和全项目源码哈希。

边界如实保留：候选SSR只有经核验的强隔离镜像才执行；本机使用明确需确认的静态AST/结构Diff降级。CodeAct因无可验证后端而fail-closed，未宣称实际容器网络/挂载隔离已验证。对未知意图、任意表达式/数据结构/绑定迁移等越界修改，返回显式规划、澄清或拒绝，不进行全文覆盖。平台级Codex中断不能由本地代码保证自动唤醒。

用户CSS保留哈希：`dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e`；干净标签代码CSS哈希：`13759a7cdbedc1cf713c5ee7186686739957998484c0491ca34f0dfb889eb26f`。两者不同是有意保留用户未提交改动，门禁以干净归档为准。

详细运行与边界见 [WORKBENCH_PIPELINE.md](WORKBENCH_PIPELINE.md)，机器可读记录见 [manifest.json](verification/manifest.json)。

### [MANUAL_VERIFICATION_STEPS]

以下三项待外部人工执行；未冒充自动浏览器验收：

1. 访问 http://127.0.0.1:4323，用本机 `.companion/auth/bootstrap-owner.txt` 的初始账户登录；在宏观卡片及展开的严格 Mermaid 图中选中独立TransitionBinding中间节点，核对共享定义和三个HOME→DISCO入口。

2. 先设置宏观zoom/pan，再下钻时间轴，拖帧、seek、reroll、实时归一化对比；记录4321预览路由，确认烘焙不切页，点击返回核对zoom/pan/scroll/selection恢复。

3. 预览Alt+S框选空白，审阅ChangePlan和Before/After Diff；若为静态降级，明确确认后Apply。等待刷新并重新选中对应区域，再Undo核对还原；切换第二账户核对私有草稿/权限和CodeAct关闭原因。

P1–P4实施与自动化验证完毕，已停止开发修改，等待外部架构师最终复核。工作台本地服务保持运行供验收。
