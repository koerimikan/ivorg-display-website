# Atelier / IVORG 对接与续接文档

更新日期：2026-10-22（America/Chicago）。本文件是当前接手入口；历史报告中的旧 src 路径按 WORKSPACE_MIGRATION.json 映射。

## 1. 当前交付与代码边界

仓库：https://github.com/koerimikan/ivorg-display-website ，当前交付分支 main。npm workspaces，单一根 package-lock.json，Node >=22.19.0。

| 位置 | 所属与职责 |
| --- | --- |
| packages/atelier/ | 通用对象图、空间/AST 内核、事务、控制面及封存 UI |
| packages/client/ | @atelier/client，Astro/Vite 开发接入与 PreviewBridge |
| apps/ivorg-website/ | 三页 Astro 官网、业务数据/样式/素材与宿主契约 |
| apps/ivorg-website/workbench/ | 宿主描述、动效注册、canonical Spec 与对象 JSON |
| src-tauri/ | Workbench + 官方宿主的 Windows 桌面组合发行 |
| scripts/ | 测试、双服务、打包及 Harness 配置编排 |

99 项文件实际移动，旧物理目录不保留镜像。SourceRef 中 src/... 是相对宿主根，不相对仓库根。引擎 HTTP 兼容资源 URL 不代表这些文件仍存在旧目录。

## 2. 首次安装与双端服务

从仓库根执行：

```powershell
npm ci
npm run dev:workbench
```

控制面：http://127.0.0.1:4323/?study=rhine 。真实宿主预览：http://127.0.0.1:4321/ 。完整工作台模式会启用 Bridge；仅 npm run dev 是普通业务预览，没有开发 Bridge，不应把两者同时启动抢占 4321。

两端只监听本机。遇 EADDRINUSE 先查 PID 与命令行，确认所属项目后再停止；不要接管、认证或强杀陌生服务。工作台父页不读 contentDocument；Bridge 保留 origin/source/epoch/nonce 和精确 postMessage 目标。

浏览器登录使用宿主本地 apps/ivorg-website/.companion/auth/bootstrap-owner.txt 中的 userId/password。这是工作台账户，不是模型 API key。首次启动生成，每台机器不同；凭据、账户、会话与运行配置不随 Git 分发，不要贴到对接群或提交日志。

## 3. DeepSeek Harness 默认 Agent

默认基础是官方 DeepSeek Harness / Cordis，Pi 只保留兼容代码及原有回归。不是“Pi 换用 DeepSeek 模型”。

已验证 SDK 0.1.0-rc.5；本机上游 checkout revision：47f943859bef60e4160492346772ded9b24f765a。上游尚处 preview，不应直接升级 latest 或套用其带裸 shell 的 coding 示例。

先准备可信、已构建的上游 checkout，再执行：

```powershell
npm run agent:configure -- --harness "E:\Citrus Cafe\小灵\projects\deepseek-harness"
npm run test:agent
npm run test:dsh:runtime
```

示例绝对路径仅适用本机，其他机器自行替换。配置脚本将版本与六个构建入口摘要写入目标宿主 .companion/agent/runtime.json；配置和路径不进入版本控制。真实推理需要启动服务的环境含 DEEPSEEK_API_KEY，可选 DEEPSEEK_BASE_URL；不要把 key 写到配置文档。test:dsh:runtime 使用本地 SSE 端点，不调用付费模型。

模型工具列表为空；分析/解释/修改提案仍接受 Atelier 证据与类型校验。Modify 不直接写文件，必须走 ChangePlan、预览、批准、CAS 和 Journal。CodeAct 仍无可信隔离后端即拒绝，不在 Windows 裸跑脚本。

每用户 runs/sessions/checkpoint 在 .companion/agent/users/<userId>/。SDK 无单 prompt cancel，所以取消/超时关闭任务拥有的 runtime。缺失配置或版本变化明确失败，不回退 Pi。详细设计和已知边界见 DSH_AGENT_IMPLEMENTATION.md。

## 4. 核心接口与宿主适配

宿主 workbench/atelier.host.json 指定 profile、projectId、framework、specFile、registryFile、routes、sourceFiles、layoutFile、motionModule。IVORG 的 profile 是 ivorg-v1。canonical 文档是 workbench/specs/ivorg.spec.xml，注册表是 workbench/objects/ivorg.object.json；二者必须保持结构同步。

Astro 开发配置经 @atelier/client/astro 接入；业务模块不直接 import 编辑器内核。workbench/motion-registry.js 连接业务 motion.js/home.js 与 SDK。引擎的 adapters/ivorg 保存特有 L3 和动效映射，不能把它误当其他项目的通用策略。

通用 Vite 插件真实存在，但只读，sourceMapping=false。Next/React/Vue AST 反写、自动框架迁移尚未实现；分析 CLI 只提供文件盘点与实际 Astro AST 证据。未知写 profile Fail-Closed。

## 5. 验证命令与证据口径

```powershell
npm run gate -- P4
node --test --test-reporter=spec scripts/workspace-decoupling.test.mjs scripts/visual-shell.test.mjs scripts/rhine-study.test.mjs scripts/rhine-camera.test.mjs scripts/rhine-interaction.test.mjs scripts/preview-interaction.test.mjs scripts/dsh-adapter.test.mjs
npm run test:dsh:runtime
npm run build --workspace @atelier/client
```

原门禁为 Workbench 126 项（30/31/33/32）、旧基线 53 项、MotionBaker 27 组/693 断言，另有前端/工作区/Harness 64 项。真实 Harness smoke 使用官方 SDK、Agent loop 和 Provider，推理 HTTP 是本地夹具；覆盖双用户落盘、Unicode、无工具 schema、429 和在途取消。不能把这些表述为真实外部模型质量验证。

生产构建输出 apps/ivorg-website/dist，扫描不得含 data-ds-id、data-cw-id、工作台或 RPC 开发残留。verification/workspace-split/ 保存迁移阶段证据；verification/push-20261022/ 保存本次推送前复核，时间与摘要分开记录，不混用旧截图。

## 6. 美术与业务保护

工作台美术基线标签 workbench-art-baseline-20261020，对应 86ca0fc；下钻联调历史提交 dacd2e0。迁移不重新布局、调色。用户官网 shell.css 原有内容已随业务移动并保留，SHA256：dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e。

真实业务只有已供资料的 IVORG Index Zero 与 7 曲，当前无播放器；Newsletter 三期是明确标记的示例内容。Web Audio、全局音频条、创作者胶囊是后续规范，不是已实现功能。

## 7. 桌面打包与未完成验收

```powershell
npm ci --prefix src-tauri
npm --prefix src-tauri run tauri:dev
npm --prefix src-tauri run tauri:build
```

需要 Windows x64、Rust MSVC、C++ Build Tools。便携 Node、工具链、资源 stage、安装器均不进 Git，构建脚本负责准备。此前安装器是拆分前版本，不代表当前 Monorepo + DSH 已打包发行。迁移阶段 cargo check 和独立 Node/Astro 生命周期 5 项通过；重新出安装器后仍需人工检查 Webview、自动登录与关闭后端口释放。

Harness checkout/模型凭据不内置在旧安装器；桌面用户需要独立配置。不要声称离线包已经包含远端模型。

待做人工项：LIVE 内 Alt+S 跨 Origin 框选；真实外部模型 Analyze/Explain 的质量验收；可丢弃宿主中 Modify→预览→Apply→Undo；新安装器端到端。此次推送不执行真实业务 Apply、远程部署或模型调用。

## 8. 阅读顺序

1. 本文件：运行、接入和接手边界。
2. ATELIER_CORE_ARCHITECTURE.md：NotebookLM 引擎知识库。
3. IVORG_WEBSITE_SPEC.md：NotebookLM 业务知识库。
4. DSH_AGENT_IMPLEMENTATION.md：默认 Harness 运行框架。
5. WORKSPACE_SPLIT_REPORT.md、WORKSPACE_MIGRATION.json：移动/修改与验收清单。
6. companion-workbench-plan.md：历史权威架构裁决；开头的路径和 DSH 追加裁决优先于旧阶段默认 Pi 的描述。
