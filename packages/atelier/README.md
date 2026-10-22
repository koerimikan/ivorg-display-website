# @atelier/workbench

独立的本地伴生工作台包，包含对象/空间/AST 内核、控制面与编辑器 UI。当前为 private workspace 包；引擎资产从包自身读取，宿主源码、Spec、对象注册表及 .companion 派生状态从传入的 project root 读取。

从工作区根目录使用：

```powershell
node packages/atelier/bin/atelier.mjs analyze --project apps/ivorg-website
node packages/atelier/bin/atelier.mjs serve --project apps/ivorg-website --read-only
```

analyze 不运行宿主脚本、不写源文件；对 Astro 文件提供真实 AST 组件与路由模式证据。serve 仅启动控制面，宿主预览需另行启动在 4321。

写入策略目前仅注册 ivorg-v1。其他 profile 必须保持只读；源码语言解析、Spec 业务约束和 motion profile 是不同的适配职责。adapters/ivorg 保留官方沙箱特定策略，不表示通用宿主已支持全部框架写入。

src/dev-studio 是被上层复用的历史内核，不再从 IVORG 业务路径导入 motion.js。宿主经 @atelier/client 开发接入。完整产品模型见 ../../docs/ATELIER_CORE_ARCHITECTURE.md。

伴生 Agent 默认使用官方 DeepSeek Harness SDK/Cordis；Pi 仅保留历史协议兼容。运行时需经 scripts/configure-dsh.mjs 配置可信的已构建 checkout，模型没有 shell/文件编辑工具，所有变更仍走 ChangePlan/Journal。见 ../../docs/DSH_AGENT_IMPLEMENTATION.md。
