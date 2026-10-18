# IVORG 设计与工程契约

## 架构

用户已确认 Astro + GSAP，三个真实路由与独立页面源码。SiteLayout 管公共外壳，页面模块返回清理函数；Astro 负责请求、URL、后退/前进和文档交换，GSAP 负责表现。

## 动效生命周期

- astro:before-preparation：并行加载下一页与 expo.out 斜向 clip-path 遮罩。
- astro:before-swap：清理当前页面、动画上下文、事件、ResizeObserver 和 rAF；离开专辑页暂停音频。
- astro:page-load：挂载新页逻辑、解码标题、执行遮罩退出与内容入场。
- 使用 gsap.context().revert() 回收页面动画。浏览器减少动态偏好和 MOTION 开关跳过切场位移。

## 排印与结构

Oswald 700 用于巨型展示字与编号，Syne 800 用于品牌与档案名；Inter 和 Noto Sans SC 用于正文/中文；JetBrains Mono 用于元数据。1px 结构线、5px 交点与胶片噪点。

## 色彩（第二轮：贴合实体印刷）

全部取自素材实测，不再使用装饰性的酸黄：

- **纸白 #F4F2EC** — 页面底色，等同海报与封面用纸。
- **墨蓝 #0B1B36** — 正文与巨型标题。
- **唱盘蓝 #0F3F97** — 唯一强调色（`--acid`），取自上架曲目表版面 70% 的主色。
- **印前青 #0A8FB0 / 洋红 #D8245F** — 只用于角标记（registration mark）与网格检视，来自 `DISK.png` 的印刷辅助线。
- **中级灰蓝 #5B6A8A** — 次级文字，纸底对比度 4.8:1。

封面、海报使用 `mix-blend-mode: multiply` 叠在纸白上，白色底自动融入纸面，呈现「印在纸上」而非「贴在屏上」。深色只保留在两处：首页曲目卡与通讯页的 NIGHT MODE 阅读面。

## 音频

当前站点**不含任何播放能力**。`audio.js`、`AudioDeck.astro` 与合成试听已随虚构 demo 数据移除；恢复播放前必须先拿到真实音源，不允许用振荡器冒充原曲。曲目时长是印在唱片上的信息，可以展示；BPM 与音源引擎没有来源，因此留空。

## 数据边界

本轮重心是社团展示站，不修改 Mint Atelier 的 CanvasState、ChangeProposal 或 locked 保护规则。旧版语义布局导出暂未迁入 Astro；不要声称本版本已实现 CanvasState 导出。网格检视继续可用。

真实内容以 `src/lib/release.js` 为唯一入口，上游是 `docs/resources/content-draft.json`（逐字段 status 与 sourcePath）。通讯页正文仍是示例写作，不得与真实唱片、活动事实混排。