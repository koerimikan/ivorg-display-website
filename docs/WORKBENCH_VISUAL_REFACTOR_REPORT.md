# Workbench 星图与目镜界面重构自验报告

日期：2026-10-20，America/Chicago。状态：四步实现与自动化自验 PASS；人工视觉验收 NOT_RUN。

## 四步交付

1. **宏观星图**：删除方向平移按钮与绑定矩形。三个页面用对象树线框缩略图、同心环、72刻度、切线与辅助方框呈现；十五个启用绑定各有独立贝塞尔轨道、路径光子、小圆环斜十字信标、键盘与鼠标入口。固定布局和分轨保持对象身份稳定。鼠标拖拽、指针中心滚轮缩放、键盘操作及适配全图可用；下钻返回恢复视口和焦点。Mermaid 保留为按需展开的技术视图。
2. **页面舞台**：页面星盘打开中央 90vw × 88vh 舞台，提供 LIVE RENDER / WIREFRAME X-RAY / NL-SPEC。预览继续使用4321真实页面；X-ray 同时提供对象树选择和 PreviewBridge 返回的实测容器边界。Alt+S矩形与Alt+L套索有实时轮廓和可见模式提示；没有安全容器时明确提示重新选择。Spec文档、AST回读、结构规划及三方字段冲突选择保留。
3. **切片仪与Agent**：从现有Fixture读取起点、终点、遮罩坐标、位移、海报deck及字符状态，绘制纯程序化几何切面；支持播放、暂停、倒放、逐帧、seek、reroll、固定帧和实时数值比较。时间轴不改变预览路由。Agent按“目标 → 解释 → 结构差异”分组，原始JSON仅在details内。保留计划、预览、静态确认、批准、Apply、Undo及项目审阅；等待Agent期间可取消。
4. **验证与服务**：完成累计P4门禁、独立前端交互测试、语法与静态安全扫描；重启已确认的工作台进程。真实HTTP检查确认4323提供的八个前端资源均与磁盘SHA256一致，4321三个页面返回200，桥接脚本已更新。

## 数学视觉与性能边界

- 原生Canvas默认520颗星尘：90%微弱星尘半径0.5–1.2 CSS px；10%亮星附带十字衍射线。亮度使用截断幂律采样，分三个深度层，指针视差采用阻尼。
- 页面附近轻微吸引与局部星座线使用有限邻域分桶；限制候选和邻接数量。慢帧累计后粒子降至360颗，DPR上限1.75。隐藏页面暂停绘制；减少动态模式关闭持续星尘视差、轨道光子和圆环旋转。未宣称已测得任何设备上的固定帧率。
- SVG的hand-drawn-ink使用fractalNoise，baseFrequency=.035、numOctaves=3、displacement scale=1.6，只作用几何墨线，不作用文字、真实网页或命中区域。
- 无外部图片、GIF或字体依赖。朱红用于当前切面和主要行动；没有深蓝灰后台面板或紫青渐变。

## Refactoring UI 十项审查

采用本机已安装的gnurio/refactoring-ui-plugin技能；以下是代码与交互测试层面的审查，最终观感由人工验收确认。

| 项目 | 自验 | 落地依据 |
| --- | --- | --- |
| 01 Visual hierarchy | PASS | 三页面星盘与当前舞台为主体，身份管理和技术信息收拢 |
| 02 Typography | PASS | 正文14px、标题20/24/32px；常用400/600两档字重，机器批注为辅助 |
| 03 Palette | PASS（按批准配色裁决） | 固定钛黑/象牙白/黄铜/朱红，功能文字用不透明颜色；透明度仅服务几何装饰 |
| 04 Spacing | PASS | 组内8/12/16px，主要分区24/32px及以上 |
| 05 Buttons | PASS | 行动有主次；预览/批准/Apply依赖清晰；平移按钮删除 |
| 06 Clutter | PASS | 绑定没有矩形卡片，管理与原始数据默认折叠 |
| 07 Empty/error states | PASS | 登录说明、连接失败重试、无安全容器提示、计划前置条件与操作状态 |
| 08 Shadows | PASS | 只在目镜暗角、中央舞台和浮层分离上使用 |
| 09 Contrast | PASS（所列主要文字组合） | 象牙白/深空16.37:1，次级文字/面板7.51:1，黄铜/深空9.68:1；主按钮黑字/朱红4.61:1，hover浅字/深朱红5.41:1 |
| 10 Grouping | PASS | Agent三段阅读顺序；时间轴、观测数据、账户工具各自分组 |

## 自动化证据

命令：

```text
node scripts/pipeline-gate.mjs P4
node --test --test-reporter=spec scripts/visual-shell.test.mjs
node scripts/visual-http-smoke.mjs
```

| 门禁 | 结果 |
| --- | --- |
| P1 | 30/30 PASS |
| P2 | 31/31 PASS |
| P3 | 33/33 PASS |
| P4 | 32/32 PASS |
| 新增前端交互测试 | 7/7 PASS |
| 旧基线 | 53/53 PASS |
| MotionBaker | 27/27组，693/693断言 PASS |
| 生产构建与零残留 | PASS，扫描17个产物文件 |
| 严格桥接静态检查 | 两处固定Origin postMessage；零contentDocument读取、零通配目标、零Fixture导航/eval |
| 真实双端HTTP | 八项前端资源哈希一致，三个预览路由200，3页面/15绑定 |

累计门禁原始输出：`.companion/gates/P4-*.txt`、`.companion/gates/P4.json`。本轮前端测试原始输出与HTTP资源哈希：`.companion/visual-verification/visual-shell.txt`、`http-smoke.json`。这些为本地派生证据，不包含登录凭据。

最终证据副本已归档至[visual-refactor验证目录](verification/visual-refactor/P4.json)，包括[前端测试完整输出](verification/visual-refactor/visual-shell.txt)与[双端资源哈希及HTTP结果](verification/visual-refactor/http-smoke.json)。最终累计门禁时间为2026-10-20T05:27:48.566Z，HTTP检查时间为2026-10-20T05:27:50.290Z。

前端DOM测试执行真实app.js和changes.js处理器，覆盖节点激活、三模式、视口返回、重复seek、reroll不跳转、结构diff、安全文本渲染、预览确认/批准/Apply/Undo顺序及等待时取消。另验证Canvas的DPR上限、减少动态、隐藏暂停与resize不积累循环。它们不等同于浏览器像素或鼠标手工验收。

## 文件与保护范围

修改：`src/workbench/shell/{index.html,styles.css,app.js,topology-renderer.js,client.js,login.js,changes.js,memory.js}`，以及`src/workbench/preview-bridge.js`。

新增：`scripts/visual-shell.test.mjs`、`scripts/visual-http-smoke.mjs`、本报告。

`src/workbench-core/`和`src/workbench-server/`均无改动，既有测试未修改。用户原有`src/styles/shell.css`未改动，SHA256仍为`dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e`。账户、权限、事务和CodeAct安全边界保持原契约。

## 人工最终验收（待执行）

1. 刷新 http://127.0.0.1:4323 ，使用原本地账户登录；观察三个星盘及十五个轨道信标，拖拽/滚轮改变视口，点击一个信标进入切片仪，拖动时间轴并reroll，然后返回核对视口。
2. 点击页面星盘，检查中央真实预览；切换X-ray与NL-Spec，在真实预览内按Alt+S框选空白区域，检查轮廓与Agent抽屉的目标/解释/结构差异。人工验收不必Apply真实业务改动。
3. 检查窄窗口、减少动态模式、键盘焦点、登录及错误状态的可读性。性能、几何遮挡与手绘质感以实际浏览器观感为准；未经人工验收不记为视觉最终PASS。

未改变的能力边界：候选补丁预览仍按现有后端返回静态AST/结构预览；无经过验证的隔离后端时CodeAct继续fail-closed。切片舞台是受现有Fixture状态约束的几何呈现，不冒充真实页面截图或未提供的动画状态。
