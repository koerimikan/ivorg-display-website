# Dev-Studio 换设备交接（2026-10-18）

## 当前任务与约束

- 仓库：https://github.com/koerimikan/ivorg-display-website.git；分支 `main`。旧设备工作目录 `D:\atelier\ivorg-display-website`，新设备自行选择目录。
- 用户已授权本次提交和 git push；没有要求部署。`PI_HANDOFF.md` 是早期历史记录，其中路径、播放器说明及禁止 push 的旧指令已过时。
- 四阶段实现均已落地；浏览器手工验收仍待用户执行。用户明确禁止 Computer Use，后续代理不要操作浏览器或桌面。
- 用户希望用 Pi 多子 Agent 节省 token。已使用 Pi 的 `deepseek/deepseek-flash` 做实现与审查；已安装模型目录没有名为 Deepseek V1Flash 的型号，不要声称使用了该型号。不要提交模型密钥或本机认证配置。

## 新设备启动

使用 Node >=22.12（本机验证版本 Node 24.16.0 / npm 11.13.0）。Astro 7.3.8、GSAP 3.15.0；实际站点使用独立 CSS，并未安装 Tailwind。

```powershell
git clone https://github.com/koerimikan/ivorg-display-website.git
cd ivorg-display-website
npm ci
npm run dev -- --host 127.0.0.1 --port 4322
```

打开 http://127.0.0.1:4322/ 。端口可换；旧设备进程不会迁移。修改 Integration / 服务端模块后请重启 dev server。

## 实现入口

- `astro.config.mjs` → `src/dev-studio/integration.js`：仅 dev 生效的 Astro Integration / Vite 插桩。
- `src/layouts/SiteLayout.astro`：DEV 条件动态导入 `src/dev-studio/index.js`；生产不挂载 HUD。
- `hud.js` / `controller.js`：Shadow DOM 工业风 HUD，`~` 或 `Alt+D` 显隐，四种互斥模式。
- `motion-baker.js` / `scene.js`：真随机状态烘焙与 DOM 回放；`motion-context.js`：动效约束注册。
- `src/scripts/{home,motion,app}.js`：物理参数、共享 GSAP 工厂、输入冻结和生命周期清理。保留已有单张海报遮罩，不要恢复重影。
- `source-engine.js` / `server.js` / `source-editor.js`：源码索引、最小切片提交、Undo、Alt+点击编辑。
- `agent-scope.js` / `context-capture.js`：框选、语义收敛、DOM/CSS 裁剪和侧面板。
- `task-service.js` / `task-proposal.js`：源码上下文、预算、结构化 JSON/Markdown 导出。
- 详细契约见 `docs/DEV_STUDIO_SOURCE_BRIDGE.md` 与 `docs/DEV_STUDIO_AGENT_SCOPE.md`。

## 四阶段状态与边界

1. MotionBaker：真实 Math.random 烘焙，快照深拷贝并 deepFreeze；回放不重新随机。1500ms/60fps 为 90 个间隔、91 个快照（0..90）。重复 seek 一致；reroll 中间帧变化是概率性质，终帧收敛。
2. 物理沙箱：factor/tau 与虚拟 8 字指针；时间轴模式停止实时视差、冻结路由输入，支持逐帧、倒放、倍率和重新烘焙。拖动只投射 DOM 状态。
3. 源码桥：compiler-rs AST/UTF-16 区间插桩，magic-string 最小修改；完整 SHA256 revision、expectedOld、路径与本地 Origin/session 校验。表达式、循环及混合动态内容保守只读；支持静态文字和受限单项 inline CSS。Undo 为进程内历史，重启丢失。写入有二次 revision 校验，但并非跨进程文件系统 CAS。
4. Agent Scope：最多 8 个语义根、80 节点、深度 6；重复列表代表项加数据摘要；关键计算样式与引用变量；目标模板及关联依赖。JSON 和 Markdown 各自 <=6000 的 UTF-8 字节保守预算代理，不是特定模型 tokenizer；发送其中一种即可。过长 intent 拒绝，不静默截断。

RPC `/__dev_studio_api/` 下有 session/resolve/commit/undo/context/proposal/export-task；只允许 loopback + 会话校验。源码改动冲突返回 409。任务固定输出到 `.dev-studio/tasks/{latest.json,dev-studio.task.json,task.md}`，该目录不入 Git；多文件导出以最后发布 latest.json 为完成标记，并非三文件原子事务。未映射 DOM 可以导出，但 editable 为空。不会自动调用 Agent。

## 已实际运行的验证

```powershell
node motion-baker.test.cjs
npm run build
node --test scripts/agent-scope.test.mjs scripts/source-bridge.test.mjs scripts/dev-studio.test.mjs
node scripts/source-bridge-smoke.mjs http://127.0.0.1:4322
node scripts/agent-scope-smoke.mjs http://127.0.0.1:4322
```

- MotionBaker：27/27 组、693/693 assertions。
- 合并 Node tests：53/53 PASS；含 409、区间替换、Undo、列表折叠、预算、空选区、生产零残留检查。
- Astro build：3 页成功；必须先 build 再运行包含 dist 扫描的测试。
- source bridge HTTP smoke：5/5，通过真实文件修改后 Undo，恢复原文件。
- Agent scope HTTP smoke：4/4，通过真实页面映射/源码关联/模块编译；DOM 摘要为合成输入，不代表鼠标交互验收。
- `git diff --check` 已通过。沙箱内测试临时目录 rename/junction 与 localhost 请求可能需额外执行权限。

## 待手工验收 / 接续顺序

1. 启动后按 Alt+D；检查沙箱虚拟指针，切换时间轴，Bake 后同一帧反复拖回显示一致，退出后正常导航恢复。
2. Select & Edit 中 Alt+点击静态文字，Apply 后检查源码仅小范围变化、HMR 生效，Undo 恢复；动态文字应只读。
3. Agent Scope 框选列表，↑/↓ 调范围，输入需求后导出；检查 `.dev-studio/tasks/` JSON/Markdown 的预算、路径和约束。再运行 build 与测试。

不要把 HTTP smoke 写成浏览器验收通过。不要恢复旧 handoff 中的演示音频/播放器；不要提交 resources、node_modules、dist、.env、本机 Pi 日志或生成的任务文件。
