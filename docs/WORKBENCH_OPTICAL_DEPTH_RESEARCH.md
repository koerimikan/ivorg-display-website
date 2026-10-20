# Workbench 光学空间迭代

2026-10-20。用户指出当前星图缺少立体、透镜与冷冽空气感。本记录补充已批准的明亮真彩方案，不改变 P1–P4 服务契约。

## 研究与判断

Apple 在 [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) 中讨论 lensing、几何高光、阴影与内容分层。本项目借鉴“光学边界表达材料厚度”的原则，采用边缘反光和门户轮缘，不把全部工作内容盖上模糊玻璃。这里的 CSS/SVG 是视觉近似，没有实现 Apple 的动态折射材料。

[PBR Volume Scattering](https://www.pbr-book.org/4ed/Volume_Scattering) 解释介质对光的衰减与散射，能产生空气透视与光束。本项目据此推导：远景应更低对比、更偏冷，局部斜射光应稀薄，中央内容应清晰。实现是程序化层次提示，不是物理体积路径追踪。

## 本轮实现

- 前景：双层非等曲率目镜轮廓、边缘冷白高光、镜内反光。与背景使用反向视差；不接收输入。
- 中景：三个门户轮缘的暗面厚度、两段轮廓高光、镜面覆盖层，以及下方椭圆定位面和接触阴影。
- 远景：低对比的透视辅助线、稀薄斜向冷光，以及三个深度的冷色星尘。保持真实网页自身色彩。
- 静态／减少动态模式关闭装饰层视差。可交互对象维持既有二维相机坐标，避免点击位置、缩放锚点与返回恢复产生漂移。

本轮没有双眼独立渲染、头部追踪或 WebXR；“目镜”是桌面观测器的光学隐喻。

## 已验证

- node scripts/pipeline-gate.mjs P4：2026-10-20T06:01:10.744Z PASS。P1=30、P2=31、P3=33、P4=32；旧基线53、MotionBaker27组／693断言；生产扫描17个文件零残留。
- node --test --test-reporter=spec scripts/visual-shell.test.mjs：10/10 PASS，含装饰层不接收输入、3个投影、6段轮廓高光和静态模式。
- core/server 无差异；用户 src/styles/shell.css SHA256 保持 dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e。
- 4323、4321 均由本地开发进程41592监听。
- 浏览器真实截图已保存于 .companion/luminous-verification/optical-native.jpg；完整内容可见，但宿主浏览器缩放导致图像模糊。其他 optical-* 整页截图有裁切，不能作为三档精确分辨率验收通过的证据。

## 尚待完成的整体验收

修正或明确记录截图后端的尺寸/缩放限制；完成三个目标 CSS 视口的截图矩阵；记录前台与后台节流条件下的性能，不能将后台约一秒的 rAF 间隔归因于 Canvas 绘制；完成页面三模式、seek/reroll、静态观测的浏览器证据；生成 WORKBENCH_LUMINOUS_REPORT.md。

这是一轮已通过自动化的视觉迭代记录，不是整体任务全部完成声明。
