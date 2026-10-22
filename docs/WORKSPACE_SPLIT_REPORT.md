# Atelier / IVORG 物理拆分验收

日期：2026-10-20。物理拆分：PASS。追加 DeepSeek Harness 基础切换：PASS（真实 Harness + 本地模型端点）。未部署、未推送、未向业务源码执行 Agent Apply。

## 1. 已落地结构

采用 npm workspaces，根目录 package-lock.json 是唯一工作区依赖锁。

| 原目录/文件 | 当前目录/文件 | 移动文件数 |
| --- | --- | ---: |
| src/workbench-core/ | packages/atelier/src/workbench-core/ | 14 |
| src/workbench-server/ | packages/atelier/src/workbench-server/ | 21 |
| src/workbench/shell/ | packages/atelier/src/workbench/shell/ | 9 |
| src/dev-studio/ | packages/atelier/src/dev-studio/ | 14 |
| src/workbench/preview-bridge.js | packages/client/src/preview-bridge.js | 1 |
| src/ 其余业务目录 | apps/ivorg-website/src/ | 19 |
| public/ | apps/ivorg-website/public/ | 7 |
| workbench/ | apps/ivorg-website/workbench/ | 2 |
| spec/ | apps/ivorg-website/spec/ | 2 |
| astro.config.mjs | apps/ivorg-website/astro.config.mjs | 1 |
| assets/、core/、pages/、styles/、motion/ 旧原型目录 | apps/ivorg-website/legacy/ | 9 |
| 合计 | 实际移动，不是保留副本的兼容目录 | 99 |

完整逐文件路径及迁移前/后 SHA256：WORKSPACE_MIGRATION.json。integrationEdited 表示移动后因接入边界而修改，不意味着原字节一律不变。历史 SourceRef 的 src/... 继续相对宿主根解释。

## 2. 新建文件与职责

| 路径 | 职责 |
| --- | --- |
| atelier.workspace.json | 集成环境的默认宿主位置 |
| packages/atelier/package.json、README.md | 引擎包边界与公开入口 |
| packages/atelier/bin/atelier.mjs | 只读盘点/真实 Astro AST 证据；独立控制面入口 |
| packages/atelier/src/workbench-server/host-config.js | 宿主路径、profile、canonical 文件和路由校验 |
| packages/atelier/src/workbench-server/dependency-lock.js | 宿主本地锁或所属 workspace 根锁定位 |
| packages/atelier/src/dev-studio/host-motion.js | 动效注册接口，消除引擎向业务脚本的反向导入 |
| packages/atelier/src/adapters/ivorg/spec-policy.js | 从原 L3 实现抽取的 IVORG 特有约束 |
| packages/atelier/src/adapters/ivorg/motion-profile.js | 从原 motion-context 抽取的业务映射 |
| packages/client/package.json、README.md、build.mjs | 宿主 SDK 与浏览器 ESM 构建 |
| packages/client/src/astro.js、vite.js、motion.js | Astro、Vite 开发插件与动效公开接口 |
| apps/ivorg-website/package.json、README.md | 业务包及独立构建命令 |
| apps/ivorg-website/workbench/atelier.host.json | 官方宿主的路由、源码与 canonical 配置 |
| apps/ivorg-website/workbench/motion-registry.js | 开发期业务动效/输入锁适配 |
| scripts/decouple-workspace.cjs | 有目录边界检查的物理迁移记录脚本 |
| scripts/workspace-decoupling.test.mjs | 6 项新增真实边界测试 |
| docs/ATELIER_CORE_ARCHITECTURE.md | 独立 NotebookLM 引擎白皮书 |
| docs/IVORG_WEBSITE_SPEC.md | 独立 NotebookLM 业务白皮书 |
| docs/WORKSPACE_MIGRATION.json、本报告 | 文件清单与验收 |
| verification/workspace-split/results.json、logs/ | 原始测试输出、摘要与日志哈希 |

原 l3.js / motion-context.js 保留兼容导出；不是复制一份业务算法继续双重维护。SDK 的 dist/atelier-client.js 为构建产物，默认忽略。

## 3. 修改范围

根 README、package.json、package-lock.json 更新工作区结构与委派命令；原架构主稿只加路径迁移说明。完整修改列表在 WORKSPACE_MIGRATION.json.modifiedTrackedFiles，包含测试、fixture、gate、静态扫描及相机 bundle 构建脚本的新路径。

引擎控制面改为从包自身读取 UI/内核资源、从宿主配置读取 canonical 路径。未知写 profile Fail-Closed。现有授权规则和 Journal 的目标限制共同工作；没有因为泛化文件名而允许任意路径写入。

业务 SiteLayout 删除原页内工具栏引入；home.js 公开业务控制器接口，app.js 使用业务输入锁事件；仅开发期 motion-registry 连接旧录制事件与业务能力。astro.config 只经 @atelier/client/astro 接入。旧 53 项测试中的相关期望随明确的新接入边界调整，没有跳过断言或降低通过计数。

桌面既有 scripts/prepare-desktop.cjs、tauri-runner.cjs、src-tauri/src/main.rs 与 README 适配新目录。隔离资源中 @atelier 包为真实目录，避免依赖工作区符号链接或父目录 node_modules。运行数据使用新的 projects/workspace-v1，保留旧 projects/default。

## 4. 实际自动化结果

| 检查 | 结果 |
| --- | --- |
| P1 / P2 / P3 / P4 | 30 / 31 / 33 / 32，合计 126/126 PASS |
| 旧 dev-studio/source-bridge/agent-scope | 53/53 PASS |
| MotionBaker | 27/27 组，693/693 断言 PASS |
| 既有前端/相机/下钻 + 新 workspace + DSH adapter | 45 + 6 + 13 = 64/64 PASS |
| 真实官方 Harness SDK / Cordis / Provider | 本地推理夹具 4 请求；双用户、429、在途取消 PASS |
| 隔离桌面 Node + Astro 生命周期 | 5/5 PASS |
| Astro 生产构建 | PASS，三页输出至 apps/ivorg-website/dist/ |
| 生产零残留 | PASS，扫描 17 个产物文件 |
| Bridge 静态安全 | contentDocumentReads=0，wildcardTargets=0，精确 postMessage 目标=2 |
| Fixture 静态路由安全 | navigationCalls=0 |
| @atelier/client 浏览器 bundle | PASS |
| 两包 npm pack --dry-run | PASS；未发布，无 .companion 凭据 |
| cargo check | PASS，Windows MSVC dev profile |
| git diff --check | PASS；仅已有 CRLF/LF 归一化提示 |

执行入口：

```powershell
npm run gate -- P4
npm run test:workspace
node --test --test-reporter=spec scripts/workspace-decoupling.test.mjs scripts/visual-shell.test.mjs scripts/rhine-study.test.mjs scripts/rhine-camera.test.mjs scripts/rhine-interaction.test.mjs scripts/preview-interaction.test.mjs
npm run build --workspace @atelier/client
node --test --test-reporter=spec scripts/tauri-desktop.test.cjs
cargo check --manifest-path src-tauri/Cargo.toml
```

桌面测试要求先准备 src-tauri/.stage/project；本轮已真实准备。原始日志归档于 verification/workspace-split/logs/；结果与逐日志摘要见 results.json。

新增 6 项 workspace 测试不是目录存在性自证：它们验证用户 CSS 保持、宿主不导入内核、canonical 文件可更名且服务仍从引擎取资源、未知写 profile 拒绝、真实 Vite 中间件修订/凭据边界、真实 Astro AST 只读分析，以及 workspace 锁定位与非 workspace 祖先拒绝。

## 5. 保留资产与未冒称完成项

用户 shell.css 移动后 SHA256 仍为 dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e。两份 canonical XML/对象文件保持内容不变；美术封存样式只移动，不重新调色或排版。

根 .companion 历史本地状态与桌面旧 appdata 保留，没有自动复制凭据或把旧事务导入新宿主。新宿主以自己的 .companion 管理状态，目录已被通用 ignore 规则覆盖。

此次没有重做浏览器多分辨率视觉验收，没有调用真实外部模型，没有执行真实业务 Apply/Undo，没有重新生成新的桌面安装器。cargo check 和 worker 测试不能替代最终安装器或人工 Webview 验收。此前 Alt+S 的人工项不因目录迁移而自动变成已通过。

通用化的实际边界：Astro 官方宿主保留完整已验证写策略；Vite 为真实只读 SDK；Next.js、React/Vue AST 反写与自动迁移暂未实现。CLI 提供实际 Astro AST 证据及迁移分析，不做无人审阅框架转换。

两份白皮书可分别导入 NotebookLM；播放器、合成器试听、全局音频条及创作者胶囊被标为后续规范，未包装成当前业务功能。


## 6. 用户追加裁决：DeepSeek Harness

伴生 Agent 默认基础已从 Pi RPC 切换至官方 DeepSeek Harness。新增 dsh-adapter.js、共享 quota-recovery.js、configure-dsh.mjs、13 项适配测试、真实 runtime smoke 与 DSH_AGENT_IMPLEMENTATION.md。agent-service 默认 startDsh；旧 PiAdapter 10 项回归仍包含在原 P3 33 项中，不叠加计数。Agent 抽屉更新框架标牌和取消文案；相关前端测试仅调整按钮名称，交互门禁断言保留。

本机宿主已记录可信 checkout 的版本和入口摘要，凭据只读环境变量。配置缺失不回退 Pi；专用组合不挂载 shell/文件编辑工具。真实官方 SDK、Cordis、DeepSeek provider、会话落盘、429 与取消都已通过本地推理端点验证，不等同于外部模型质量验收。完整版本、配置与边界见 DSH_AGENT_IMPLEMENTATION.md。
