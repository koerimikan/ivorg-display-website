# IVORG 设计与工程契约

## 架构

用户已确认 Astro + GSAP，三个真实路由与独立页面源码。SiteLayout 管公共外壳，页面模块返回清理函数；Astro 负责请求、URL、后退/前进和文档交换，GSAP 负责表现。

## 动效生命周期

- astro:before-preparation：并行加载下一页与 expo.out 斜向 clip-path 遮罩。
- astro:before-swap：清理当前页面、动画上下文、事件、ResizeObserver 和 rAF；离开专辑页暂停音频。
- astro:page-load：挂载新页逻辑、解码标题、执行遮罩退出与内容入场。
- 使用 gsap.context().revert() 回收页面动画。浏览器减少动态偏好和 MOTION 开关跳过切场位移。

## 排印与结构

Oswald 700 用于巨型展示字与编号，Syne 800 用于品牌与档案名；Inter 和 Noto Sans SC 用于正文/中文；JetBrains Mono 用于元数据。曜石黑 #090A0C、暖白 #F4F4F0、纸张 #F2F2EE、酸黄 #E5FF00、工业青 #00F0FF。1px 结构线、5px 交点与 opacity 0.035 胶片噪点。

## 音频

播放器仅属于专辑页。session-level 音频状态保留选曲和进度，但 UI 离场立即暂停。合成器与本地 MediaElement 共用 gain -> compressor -> analyser 总线。页面清理会取消 UI rAF/监听器及合成排程；页面真正卸载时释放音频资源。

## 数据边界

本轮重心是社团展示站，不修改 Mint Atelier 的 CanvasState、ChangeProposal 或 locked 保护规则。旧版语义布局导出暂未迁入 Astro；不要声称本版本已实现 CanvasState 导出。网格检视继续可用。