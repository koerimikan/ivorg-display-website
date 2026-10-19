# Companion Workbench：运行与验收

唯一设计主稿是仓库根目录 `companion-workbench-plan.md`，按评审原文件逐字节归档。`spec/companion-workbench-architecture.spec.xml` 是不可混作运行数据的评审输入快照；实际可编辑的规范只有 `workbench/specs/ivorg.spec.xml`，注册表位于 `workbench/objects/ivorg.object.json`。注册表图必须与当前 Spec 编译结果一致，新增节点须在同一 Journal 事务内登记到 Spec。`.companion/` 全部为本机状态，已被 Git 忽略。

## 启动

使用 Node >=22.19.0；本次实测 Node 22.21.0。执行 `npm ci`、`npm run dev:workbench`，然后访问 `http://127.0.0.1:4323`。控制面监听 4323，预览监听 4321，端口占用会拒绝启动。首次 owner 凭据只存于本机 `.companion/auth/bootstrap-owner.txt`，不要提交、分享或放入构建产物。登录后 owner 可建立其他本地账户；viewer/reviewer/editor/owner 权限以服务端磁盘成员记录为准。

普通 `npm run dev` 保留旧工具；Workbench 启动方式以只读 PreviewBridge 替换旧 HUD，关闭 4321 的旧写 RPC。生产构建启用两者中的任何一方都不成立：开发插件、运行标记和控制面脚本不得进入 `dist/`。

## 编辑路径

宏观图包含三页、四条阅读顺序邻接和十五个启用的 TransitionBinding 中间节点。十二条绑定共享 `td.wipeCover`；HOME→DISCO 有三个页面局部入口。卡片、严格模式本地 Mermaid 和组件树都通过明确对象身份下钻，返回恢复宏观 zoom/pan/scroll/selection。Mermaid 适配失败时，卡片保持可聚焦、可操作。页面缩略 SVG 来自 zone/node 序列。

转场使用 Session 独立的 seed、poster deck 与单调 instanceSeq；读取/seek 不导航。矢量 Fixture 不含视差或真实素材。120fps 烘焙支持正倒放、倍率、reroll、固定帧和实时归一化模型对比。真实 GSAP wipe 工厂的五个固定时间点另有数值对齐测试；这不是浏览器截图或像素一致性声明。环境指纹、源码/生成器版本和有效参数进入 bakeKey。

预览内按 Alt+S 框选，Alt+L 套索；空白区域也可选。关键操作使用独立 requestId 重新测量，要求同 epoch/选区/源码版本、字体 ready、误差不超过 1 CSS px。四种坐标帧、content-box 归一化、网格与方向邻居保留在选区中。高置信度的连续网格范围可生成限定的行列 CSS；低置信度仅 append 并给出原因。旋转、动画、dense、表达式、组件内部及运行态 Reader 子树等条件会返回明确拒绝码。

所有写入走 `ChangePlan → Before/After Diff → Preview → Approve → Apply`，Undo 是另一笔受保护的逆事务。批准绑定 actor、文件基线、patchDigest、policyRevision、过期时间与单次使用标记。JSONL Journal 保存追加式哈希链，JSON 只是状态镜像；中途崩溃按 live hash 恢复，外部字节触发 `RECOVERY_REQUIRED`、只读和恢复 Diff。它不声称文件系统 ACID。

**候选代码不会在宿主执行 SSR。** 没有可验证的本地 Linux 隔离镜像时，预览返回 `mode=static-ast`、`ssrExecuted=false`、`buildPassed=null`，必须明确勾选静态预览确认后才能批准。配置了摘要固定、lockfile 匹配且通过运行时隔离核验的镜像后，才可运行容器 SSR。当前机器未验证该分支的实际容器执行。

Spec 变更中的静态属性、确定性文字和受支持的新 Node 可生成 typed ops；Description/Rationale/Acceptance 只进入 `planFromProse`，不按散文直接改源文件。AST 回读提供 observed 记录、结构 delta 和 drift，保留意图。真实同字段冲突须选择 digest 绑定的三栏裁决。路由漂移、绑定删除/迁移、任意表达式/数据结构改写需要显式规划或被阻断，不能用全文覆盖绕过白名单。

Pi 使用已安装 1.3.0 的本地 `rpc.md`/`rpc-commands.md` 契约，按用户分隔 session-dir。工具、扩展、MCP、skills、prompt templates 关闭；环境变量只传白名单。ContextBundle 限定目标、8 个兄弟、4 个组件、全部不变量与真实源码证据，默认最多6000 UTF-8字节，每文件最多200行；不够就明确列出省略或要求缩小范围。Modify/Analyze/Explain 输出必须引用提供的证据，写入仍回到 ChangePlan。

## 记忆与安全边界

L1 事件日志追加、哈希串联、脱敏并按用户/项目过滤；死 writer 锁只在 PID 明确退出后回收。L2 类型槽按 `instance > binding > definition > project > user` 解析，继承锁阻止覆写。L3 `node:sqlite` FTS5 是派生索引，支持触发器、重建、supersession 与陈旧 Spec 标识；授权不读取搜索结论。

CodeAct 只接受可验证的强隔离后端，脚本摘要、输入路径/用户作用域、挂载、网络与资源限制都须通过。当前没有已验证后端，执行返回 `SANDBOX_UNAVAILABLE`，日志、槽和检索仍可用。测试中的可信传输夹具验证了真实超时与输出截断；不把它冒充为 Windows 不可信脚本隔离。未知意图、模糊跨会话联想和边界外数据需求直接澄清，不引入向量数据库或猜测。

## 门禁、断点与人工验收

`npm run gate -- P1` 至 `P4` 分别运行构建、全产物零残留扫描、53项旧测试、27组/693条 MotionBaker 断言、桥静态检查及截至该阶段的全部命名测试。精确输出在 `.companion/gates/`。`node scripts/clean-archive-gate.mjs` 从 Git HEAD 创建干净副本，按顺序重跑四个门禁，保留输出于 `.companion/clean-archive-gates/`，不包含用户未提交的 CSS。

`.companion/pipeline-state.json` 记录微步骤；`pipeline-checkpoint.mjs` 只提交明确列出的任务文件。Pi 配额错误先持久化上下文与重试时间，按间隔探测，恢复前重核 Git 状态、Spec 和源码事实。Codex 平台本身的会话中断不能由本地代码捕获或保证自动唤醒；重入时必须从磁盘状态和最后有效门禁继续，不能将中断当作 PASS。

本任务遵守仓库禁止 Computer Use 的约束，未操作浏览器。外部人工验收：① 登录后点击卡片或展开 Mermaid，进入 Binding 时间轴；② scrub/reroll/实时对比并返回，核对宏观视口恢复和预览路由不变；③ 在空白区域生成计划，审阅 Diff/静态预览提示后 Apply/Undo，再用第二账户核对草稿、权限和沙箱拒绝信息。最终自动化结果与完整输出以 `FINAL_COMPLETION_REPORT.md` 及其验证附件为准。
