# IVORG Atelier Lab Desktop — Tauri v2

本目录是独立的桌面组合发行工程。2026-10-20 工作区拆分后，从 apps/ivorg-website 收集宿主资源，从 packages/atelier 与 packages/client 收集引擎和 SDK；根锁文件用于生成隔离运行依赖。打包脚本不会 prune 开发者的 node_modules，也不改写业务源码。

拆分后的桌面运行数据使用 projects/workspace-v1；旧 projects/default 保留，避免覆盖旧安装版本的本地事务和凭据。历史 VERIFICATION.md 是拆分前安装器的验收，不代表新结构的安装器已重新打包。本轮新结构的 worker 运行验证见 docs/WORKSPACE_SPLIT_REPORT.md。

## 一键命令（从仓库根目录）

```powershell
npm ci --prefix src-tauri
npm --prefix src-tauri run tauri:dev
npm --prefix src-tauri run tauri:build
```

或直接执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1`。
在 `src-tauri/` 内也可使用 `npm run tauri:dev` / `npm run tauri:build`。

首次构建需要联网下载 npm / Rust crate / WebView2 离线安装器；**安装后的工作台不需要系统 Node、npm 或网络来启动本地界面**。外部 Pi Provider、模型及 Docker/VM 不随包分发；这些能力仍使用原有配置和失败关闭边界。

Windows x64 前置条件：Node 22.19+、Rust stable 的 `x86_64-pc-windows-msvc` 目标、Visual Studio C++ Build Tools。Rust 官方安装说明：https://rustup.rs/ 。脚本检测到缺失会明确报错，不会假称已打包。本机额外安装的 Rust 位于被忽略的 `.tools/cargo` / `.tools/rustup`，仅构建进程使用，不修改全局 PATH。

`-PrepareOnly` 只生成资源、便携 Node 并验证 Web 构建；`-SkipRegression` 仅用于本地调试缩短准备时间，交付构建不要跳过。`tauri:dev` 使用 `--no-dev-server-wait`，因为监听 4323 的 Sidecar 是 Rust 应用启动后创建，避免 CLI 等待导致启动死锁。

## 双进程与退出

Rust 只派生一个 `node-runtime` 管理器。就绪握手同时校验启动 nonce、管理器 PID 与双端口；通过 `.companion/desktop/ready-<nonce>.json` 原子文件避免依赖 GUI 进程的控制台输出分帧，退出时清除。Astro 遥测和更新检查均关闭。管理器并行创建两个独立 Node worker：4323 控制面、4321 Astro Dev 只读预览。预览沿用 COMPANION_P1 和现有 PreviewBridge；控制面保留原 P4 认证和授权，未更改协议。

启动遇到已占用端口会拒绝运行，**不会复用、登录或杀死已有服务**。桌面客户端的主 Webview 始终导航到 `http://127.0.0.1:4323/?study=rhine`；about:blank 只作为隐藏 Cookie 注入阶段，不使用 tauri://localhost 承载工作台。4321 iframe 的 Origin 不变。

正常关闭：Rust 发送 stdin shutdown，Node 通知两个 worker 清理，随后 Rust shell 的 process-group / Windows Job 对象强制兜底清理整棵派生进程树。Destroyed / ExitRequested / Exit 均有幂等清理。Node 管理器和 worker 另有父进程存活 / IPC 断连监控，处理上级意外退出。

## 自动登录与磁盘边界

首次启动由控制面创建本地 owner 账户并写入 `.companion/auth/bootstrap-owner.txt`。若账户已存在而该文件丢失，启动器在控制面启动前调用 `recoverBootstrapOwner`：轮换本地 owner 密码、提升账户版本使旧会话全部失效、重新写入 0600 凭据文件，并在 stderr 打印提示；没有可用 owner 账户时失败关闭（BOOTSTRAP_OWNER_UNAVAILABLE）。

Rust 从当前工程 `.companion/auth/bootstrap-owner.txt` 读取凭据，通过固定 Loopback Origin 的 HTTP 登录取得 Session，再通过原生 CookieManager 写入 HttpOnly、SameSite=Strict、Path=/api Cookie；读回确认后才加载工作台。凭据和 Session 不进入 JS、URL、命令行参数或日志。没有给远程网页任何 Tauri shell / 文件系统权限。

开发模式使用当前仓库。安装版首次启动把内置工程复制到应用本地数据目录 `org.ivorg.companion/projects/default/`，在那里生成新的认证与记忆；不向 Program Files 等资源目录写状态。后续启动保留这个可写工程，不覆盖用户修改。升级时也不静默覆盖旧工程，结构迁移需另外设计。

首次初始化需要复制约两万个运行时文件，在本机并行打包时约需两分钟，受磁盘和杀毒扫描影响；后续启动复用已有副本。当前仓库的账户、凭据和记忆不会随安装包分发。

资源准备采用允许清单：src、workbench、public、Astro 配置、项目 manifest 和独立 node_modules。**不打包 .companion、现有认证、.env、Git 或测试**。运行时必须使用的 compiler-rs / esbuild / magic-string / mermaid / sax / linkedom 被提升到独立运行清单；先重算锁文件闭包，再 npm ci --omit=dev，只安装运行时依赖闭包。根项目依赖不会被 prune。

便携 Node 固定版本 22.21.0，来源 nodejs.org，以官方 SHASUMS256 校验后才复用或下载；随包命名为 `node-runtime-x86_64-pc-windows-msvc.exe`。安装器采用 NSIS `.exe`，包含 WebView2 offlineInstaller；裸 Rust exe 本身不包含外部资源，不能当作单文件便携版单独分发。

## 验证

```powershell
node --test --test-reporter=spec scripts/tauri-desktop.test.cjs
node scripts/pipeline-gate.mjs P4
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-desktop.ps1
```

桌面测试使用仓库外的系统临时工程与临时端口，覆盖真实 Node+Astro 启动、原有登录、HttpOnly Cookie、管理器正常退出、管理器被杀后的 worker 清理及端口重绑；不碰现有 4321/4323 服务。

`COMPANION_DESKTOP_SMOKE=1` 可让原生窗口启动并验证 Cookie 后自动关闭，用于测试实际 Destroyed / Job 清理链。该模式不绕过认证、不会自动 Apply，只省去错误消息框的人工确认。最后结果见本目录 `VERIFICATION.md`。

官方接口依据：
- https://v2.tauri.app/develop/sidecar/
- https://v2.tauri.app/reference/cli/
- https://docs.rs/tauri-plugin-shell/2.5.0/tauri_plugin_shell/process/struct.Command.html
- https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html
