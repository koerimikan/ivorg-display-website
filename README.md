# Atelier Workbench × IVORG Workspace

本仓库已拆分为通用伴生工作台与独立的 IVORG Astro 宿主。Node >=22.19.0，npm workspaces，根目录统一安装与锁定依赖。

## 目录与责任

| 路径 | 职责 |
| --- | --- |
| packages/atelier | @atelier/workbench：对象图、空间/AST 引擎、事务、控制面、Agent 与编辑器 UI |
| packages/client | @atelier/client：宿主 PreviewBridge、Astro/Vite 开发接入、浏览器 ESM 构建 |
| apps/ivorg-website | @ivorg/website：三页官网、样式、数据、素材及宿主自己的架构 Spec |
| scripts | 工作区集成测试、构建、素材与桌面编排 |
| src-tauri | 引擎 + 官方宿主的桌面组合发行；不属于业务静态站 |
| docs | 两份产品白皮书、迁移清单与历史证据 |

## 运行

从仓库根执行：

```powershell
npm ci
npm run dev
npm run build
npm run preview
```

纯业务预览 http://127.0.0.1:4321/；构建输出 apps/ivorg-website/dist/。普通业务构建不包含 Workbench 客户端。若启用工作台：

```powershell
npm run dev:workbench
npm run atelier:analyze
npm run build --workspace @atelier/client
```

控制面 http://127.0.0.1:4323/?study=rhine，预览 4321。已存在服务时拒绝抢占端口。首个 owner 凭据保存在宿主本地 apps/ivorg-website/.companion/auth/bootstrap-owner.txt，不提交、不要复制到文档。桌面原生引导可自动登录，浏览器端仍遵循认证流程。

伴生 Agent 默认基于官方 DeepSeek Harness（不回退 Pi）。先用 npm run agent:configure -- --harness "上游已构建 checkout 的绝对路径" 记录本地版本/入口摘要，凭据仅使用环境变量 DEEPSEEK_API_KEY。npm run test:agent 验证适配器，npm run test:dsh:runtime 使用本地推理夹具验证真实 Harness 链路，不调用付费模型。细节见 docs/DSH_AGENT_IMPLEMENTATION.md。

仅启动一个已有宿主的控制面：

```powershell
node packages/atelier/bin/atelier.mjs serve --project apps/ivorg-website
node packages/atelier/bin/atelier.mjs analyze --project apps/ivorg-website
```

serve 不替宿主启动预览；完整双服务用 dev:workbench。未知 profile 不启用写能力。Astro 官方宿主有已验证 AST/事务策略；通用 Vite 插件仅支持只读预览接入；Next.js 写入与自动框架转换尚未实现。

## 验证

```powershell
npm run gate -- P4
npm run test:workspace
node --test --test-reporter=spec scripts/visual-shell.test.mjs scripts/rhine-study.test.mjs scripts/rhine-camera.test.mjs scripts/rhine-interaction.test.mjs scripts/preview-interaction.test.mjs
node --test --test-reporter=spec scripts/tauri-desktop.test.cjs
```

P4 gate 包含 126 项 Workbench、53 项旧内核、27 组/693 MotionBaker 断言、生产构建与零残留/Bridge 扫描。桌面测试先按 src-tauri/README.md 准备隔离资源；它验证真实 Node/Astro worker，不借用父目录依赖。

## 白皮书与迁移记录

接手请先阅读 [对接与续接文档](docs/INTEGRATION_HANDOFF.md)。

- [Atelier 架构与产品核心白皮书](docs/ATELIER_CORE_ARCHITECTURE.md)：可独立导入 NotebookLM。
- [IVORG 展品与沙箱业务白皮书](docs/IVORG_WEBSITE_SPEC.md)：可独立导入另一知识库；音频/创作者胶囊明确区分现状与规划。
- [拆分验收报告](docs/WORKSPACE_SPLIT_REPORT.md)：文件清单、测试结果、兼容边界。
- [99 项逐文件移动清单](docs/WORKSPACE_MIGRATION.json)：迁移前路径、迁移后路径、迁移前 SHA256。
- [桌面构建](src-tauri/README.md)：在根目录执行 npm --prefix src-tauri run tauri:dev 或 tauri:build。

IVORG 真实唱片资料来自 docs/resources/content-draft.json；Newsletter 是示例内容，当前没有播放器。resources/ 原始大素材、node_modules/、dist/ 与任何层级 .companion/ 均忽略。旧报告中的 src/... 指其生成时的历史路径，按移动清单查找现路径，不应据此恢复重复源码目录。
