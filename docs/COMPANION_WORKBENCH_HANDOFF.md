# Companion Workbench handoff

更新时间：2026-10-19（America/Chicago）

## 当前交付状态

Companion Workbench P1–P4 已在本地完成。最终验证代码提交为 `12c0cda868ccc74100639691b8470e2333ea0b72`；归档提交会再加入最终报告、验证证据、需求审计和归档脚本。阶段门禁结果为 P1 `30/30`、P2 `31/31`、P3 `33/33`、P4 `32/32`，共 126 项新增测试；既有基线为 `53/53`，MotionBaker 为 `27/27` 组、`693/693` 断言。生产构建与 residue 扫描均通过。

权威设计文件为仓库根目录的 `companion-workbench-plan.md`。运行时 Spec 是 `workbench/specs/ivorg.spec.xml`，对象注册表是 `workbench/objects/ivorg.object.json`，批准的 XML 参考副本是 `spec/companion-workbench-architecture.spec.xml`。`.companion/` 只保存本地派生状态和验证证据，已加入忽略规则。

## 运行与验收

当前工作台服务保持运行：控制面 `http://127.0.0.1:4323`，预览端 `http://127.0.0.1:4321`。控制面通过严格 origin/source/epoch/nonce/docRevision 校验的 PreviewBridge 通信；没有父页 `contentDocument` 读取，也没有 `postMessage('*')`。P1–P4 的真实 HTTP smoke、Pi 1.3.0 三能力 smoke、clean archive gate 原始输出都在 `docs/verification/`，汇总报告在 `docs/FINAL_COMPLETION_REPORT.md`。

首次本地 owner 凭据只写入 `.companion/auth/bootstrap-owner.txt`，不要把密码、Cookie 或 CSRF 值打印到聊天、日志或提交中。人工浏览器验收尚未执行；自动化验证使用 HTTP、受信 Node/DOM 测试和真实 Pi 进程完成。候选补丁预览当前采用静态 AST/结构预览；本机没有经过证明的 Linux 容器后端，因此 CodeAct 对不可信脚本按 fail-closed 拒绝执行。

## 继续工作时先做什么

1. `git status --short`，确认只出现用户保留的 `src/styles/shell.css` 修改或新的工作文件。
2. 阅读 `docs/FINAL_COMPLETION_REPORT.md`、`docs/WORKBENCH_PIPELINE.md` 和 `.companion/pipeline-state.json`，以报告和状态文件为当前事实。
3. 修改运行时代码后，先运行对应阶段测试，再运行 `node scripts/clean-archive-gate.mjs`；不要绕过阶段门禁，也不要把 `.companion/` 派生文件加入 Git。
4. 任何业务源码写入必须经过 ChangePlan、结构 diff、批准、Journal/CAS 和可逆 Undo；Spec 的自然语言 Description 只能生成规划，不能直接改 Astro。

## 约束与已知边界

保留用户原有的 `src/styles/shell.css` 改动，不要 reset、checkout 或提交它。平台级模型额度耗尽无法由仓库内代码捕获或自动唤醒；本地 Pi quota 状态与探针已实现，但平台中断需要下一次会话从 `.companion/pipeline-state.json` 续接。没有已验证沙箱时禁止在 Windows 主机裸执行不可信 CodeAct。

