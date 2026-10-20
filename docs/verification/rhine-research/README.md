# RhineLabUI 对标研究证据包

这是**研究归档，不是新界面验收报告**。本次没有实施新的页面、材质或路由器，没有运行并宣称新的126项产品测试通过。最终建议见[策划案](../../WORKBENCH_RHINE_PLAN.md)，完整推导见[研究报告](../../RHINE_WORKBENCH_RESEARCH.md)。

## 证据分级

|材料|是什么|不能证明什么|
|---|---|---|
|作者archive/detail/assembly原图的远程链接|原项目文档媒体，固定源码commit；作者标注采于2026-09-09|不是我们实现后的截图，不是当前运行时一致性验证|
|`rhine-live-detail.jpg`|实际访问作者公开演示后取得的原始浏览器截图，1280×720|不是我们的产品截图；未因此复制原项目全部交互|
|`endfield-official-20261020.jpg`|当前终末地官网实测截图，1265×712|当前首屏是角色宣传，不能当“三卡片无限网格”的证据|
|`visual-directions.svg/png`|自行绘制的三种明度/材质方向示意，明确不描绘真实页面内容|不是参考原图、生成模型照片、真实3D渲染或已验收UI|
|`route-counterexample.svg/png`|由研究候选的实际线路坐标生成的反例图|不是通过验收的最终拓扑|
|`experiments/*.json`|读取真实对象或数学模型得到的计算结果|不是浏览器原生命中、GPU性能、完整WCAG审计|
|`reference-sources.json`|10份外部源码的固定URL、长度与SHA256，以及图片来源/证据等级|不能替代肉眼审美判断；源码内容未作为项目依赖执行|

作者媒体保留远程引用，没有下载第三方媒体绕过显示限制。两个本地JPEG是浏览器取证的原始结果，未裁切或润色；字节数与SHA256在来源清单中。初始开机过渡期截图`rhine-live-overview.jpg`未纳入证据。

## 可复算研究

从仓库根目录运行，使用项目已有Node依赖。计算只读业务数据，将派生结果写入被忽略的`.companion/rhine-research/`；两个绘图脚本会更新本证据包中的SVG/PNG。不要把这些研究程序加入产品测试通过数。

```powershell
New-Item -ItemType Directory -Force -Path '.companion/rhine-research'
Copy-Item -LiteralPath 'docs/verification/rhine-research/experiments/topology-facts.json' -Destination '.companion/rhine-research/topology-facts.json'
node docs/verification/rhine-research/experiments/projection-study.mjs
node docs/verification/rhine-research/experiments/bus-study.mjs
node docs/verification/rhine-research/experiments/corridor-study.mjs
node docs/verification/rhine-research/experiments/counter-review.mjs
node docs/verification/rhine-research/experiments/visual-directions.mjs
node docs/verification/rhine-research/experiments/counterexample-figure.mjs
```

`topology-facts.json`是本次真实15绑定的快照；对象Spec变更后需先重新核对，不可把历史快照当实时事实。`projection-study.mjs`读取实时Spec与现有布局；其余路由研究依赖该身份快照。归档副本仅调整了projection脚本相对import层级，其余计算与原研究一致。

## 已发现的失败与保留门禁

- 通用八方向A*候选产生221段、单条最多34次转折：否决，不因算法能找到路就采用。
- 限定通道候选降为50段、单条最多4段，但反审发现8组线路侵入无关芯片与4组共线线路：**仍否决**。
- 27组视口/姿态下最小芯片中心距离约46.73px，仅说明该数学布局的命中面分离预算；**不等于实际浏览器PASS**。
- 青色在白底的约1.21对比、白字在青底约1.41对比，不用于普通文本；透明叠加后的可读性仍需实测。
- 新3D场景、屏幕投影后的15个实际bindingId命中、浏览器缩放、真实帧耗时与人工美术验收均为**NOT_RUN / 等批准后实施**。
- 反方审查由主Agent对自己的候选执行，不冒称外部独立审计。

研究窗口从2026-10-20 09:13 America/Chicago开始，按调度分项取证与复算。调度之间的等待不计为连续工作时长。既有126项Workbench、53项基线与27组693断言是后续实施门禁，不是本证据包新增的通过结果。
