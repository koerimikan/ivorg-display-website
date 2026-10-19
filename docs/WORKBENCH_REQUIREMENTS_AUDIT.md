# Companion Workbench 最终逐项自验

设计权威：`../companion-workbench-plan.md`。全部自动化门禁通过，证据与限制详见 [最终报告](FINAL_COMPLETION_REPORT.md)。

| 要求 | 实现 / 可执行证据 |
| --- | --- |
| P1 唯一Spec、稳定身份、继承/包含环 | spec-l1 / anchor / topology / object-contract / registry-identity；注册表漂移拒绝 |
| P1 双Origin只读桥、宏观下钻与视口恢复 | bridge-session / workbench-p1 / topology-renderer；真实4323/4321 HTTP smoke |
| P1 Session RNG、deck、确定性及实时数值对比 | fixture / fixture-alignment；真实GSAP五个时间点≤1e-3；明确排除视差 |
| P2 全空间、网格/邻居、fresh 1px重测 | geometry / spatial-measure / preview-http / multi-user；HMR DOM版本及凭据剥离 |
| P2 typed ops、格式、UTF-16、remap与身份登记 | insert / remap / registry-identity / spec-service结构新增事务 |
| P2 隔离预览、批准、Journal、崩溃恢复与Undo | preview-safety / approval / journal / undo / change-api；静态降级需明确确认 |
| P3 完整XML L1/L2/L3、Spec↔AST及冲突 | spec-l3 / object-contract / sync / merge / spec-service；散文不直接改代码 |
| P3 Newsletter正文同一渲染契约 | parity：三期真实SSR与DOM CSR文本/href逐项相等，无innerHTML |
| P3 Pi三能力、RPC、证据上下文与恢复事实 | pi-adapter / agent-context；实际Pi三能力及临时副本Apply/Undo |
| P4 角色/账户/会话/CSRF及多用户范围 | authz（14个显式负向案例及会话/角色测试）/ multi-user真实HTTP |
| P4 append-only日志、槽与派生FTS5 | eventlog / slots / memory；死writer、脱敏、优先级、锁、重建、supersession、陈旧隔离 |
| P4 CodeAct强隔离或fail-closed | sandbox：hash/路径/junction/跨用户/网络和写入策略拒绝，真实传输超时与输出限制；本机后端缺失拒绝执行 |
| 四阶段生产零残留、旧基线与干净归档 | 四轮build+全dist扫描；53/53和27/27·693；用户CSS哈希未变 |
| 人工浏览器与实际容器执行 | NOT_RUN：禁止Computer Use；无验证容器后端。均明确保留边界，不伪称已验收 |
