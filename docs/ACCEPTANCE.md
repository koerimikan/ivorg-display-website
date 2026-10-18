# Astro 迁移验收记录

日期：2026-10-17（America/Chicago）。

## 已完成检查

- `npm run build`：成功生成 `/`、`/discography/`、`/newsletter/` 三个静态页面。
- `npm audit`：0 vulnerabilities（Astro 7.3.8 / GSAP 3.15.0）。
- 桌面 1440 × 960、移动端 390 × 844：独立页面与公共导航正常。
- 快速连续导航：最终显示最后请求的板块；浏览器后退正确返回通讯页。
- GSAP 斜向 clip-path 横扫、标题解码及入场正常；减少动态时不显示强制遮罩。
- 移动端隐藏遮罩大字曾造成溢出，已限制尺寸并裁切，复验文档宽度与布局视口一致。
- 专辑试听：选择 GLASS PROTOCOL 后播放状态、曲名、132 BPM 和进度更新。
- 播放进度：键盘 End / ArrowLeft 将暂停曲目定位至 00:31 / 00:32。
- 播放生命周期：离开专辑页后播放器不存在且音频暂停；同会话返回保留 GLASS PROTOCOL 与约 15 秒进度，不自动播放。
- 本地音频：上传项目生成的 8 秒 WAV 测试文件，挂载成功，显示文件名、LOCAL 和正确时长并开始播放。
- 频谱实现：合成器与本地 MediaElement 使用同一 AnalyserNode；Canvas 读取真实频率数据。未进行听感或混音评估。
- 通讯：Pi 生成的 Astro 页面与阅读模块已集成；切换 ISSUE #04 / #03 后标题、正文、参数表、选中状态与查询参数更新。
- 阅读主题：纸张模式切换成功，切换期刊保持当前主题。
- 第三期 ISSUE #02 内容、参数表和查询参数更新正常；网格检视生成 6 个结构尺寸框，开关可关闭。
- 本轮浏览器未观察到脚本错误。

## 产物

`previews/astro-home.jpg`、`previews/astro-discography.jpg`、`previews/astro-newsletter.jpg`。预览按约定不纳入 Git。

## 限制

未做 Safari/Firefox 与真机触控专项验证、完整无障碍审计或性能基准。专辑、署名、声库标签与通讯均为演示数据，不包含真实歌姬人声。未部署、未推送。旧版 CanvasState 语义导出未迁入本版。
