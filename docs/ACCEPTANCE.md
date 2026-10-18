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

---

# 真实素材接入（第二轮）

日期：2026-10-17 深夜。范围：只让专辑页与首页说真话，通讯页与活动归档不在本轮。

## 改动

- 新增 `src/lib/release.js`：1 张专辑、7 首曲目、署名、4 场活动，全部溯源到 `docs/resources/content-draft.json`。
- 新增素材：`public/artwork/ivorg-index-zero-cover{,-600,-1200,-2400}.webp` + `.avif`，四张活动海报 WebP。
- 重写 `discography.astro`：单专辑、7 曲、4 列曲目表，**移除播放器与合成试听**。
- 重写 `index.astro`：真实封面 + 真实曲目表卡片，补全称 `Illinois Vocaloid Research Group / UIUC`。
- 删除：`src/lib/audio.js`、`src/lib/artwork.js`、`src/components/AudioDeck.astro`、`src/scripts/discography.js`、`public/artwork/album-0*.svg`（仅虚构专辑的程序化封面）。
- 动效开关从被删除的播放器移到顶栏（`#motion-toggle`），桌面与移动端均可用。
- `shell.css` 去掉 `body[data-page=discography]{--deck:86px}` 的播放器占位。

## 验证

- `npm run build`：通过，3 页静态产物。
- `dist` 内 `IVORG-01/02/03`、`SYNTH PREVIEW`、`KIRI|NORA|MIO` 均为零命中；`IVORG-0001` 正常出现。
- 曲目页 4 处 `试听` 字样全部为「试听音频待社团提供」的说明，无任何播放控件。
- 1440×980 与 390×844 截图（`previews/rm-*.png`、`previews/cdp-*.png`）：
  - 首页封面、曲目表卡片、坐标读数正常；移动端字号与卡片不溢出。
  - 专辑页 7 行曲目、时长、VOCAL 全部渲染；`CD / STEREO` 不再被竖排贴纸遮挡（贴纸已删）。
  - 移动端顶栏：隐藏芝加哥时钟后 `brand 284px + system 106px = 390px`，不再横向溢出；CDP 实测 320/360/390 三档 `document.scrollWidth === innerWidth`。
- 通讯页仍为示例内容，页面自身标注 `DEMO ISSUES / ILLUSTRATIVE CONTENT`，未改动。

## 已知限制

- 发行日 `26.08.24` 仍未经社团确认，页面写「印行日期」而非「发行日」。
- 第 4 场活动日号缺失，数据里保持 `null`，本轮未渲染活动区。
- 活动海报与角色立绘未上页面，等授权与版面决定。
- 未做真机触控、Safari/Firefox 验证。

---

# 换封面与印刷配色（第三轮）

日期：2026-10-18 凌晨。用户要求：封面改为 `resources/album/preview/Cover.jpg`，全站配色与视觉贴合海报/专辑。

## 实测取色

| 用途 | 颜色 | 来源 |
| --- | --- | --- |
| 纸白 | `#F4F2EC` | 海报与封面的纸底（实测 `#FEFEFF`，略调暖以减轻屏幕荧光感） |
| 墨蓝 | `#0B1B36` | 封面细线与海报文字的墨色 |
| 唱盘蓝 | `#0F3F97` | `jacket_2` 曲目表面板，占画面 69.8% |
| 印前青 / 洋红 | `#0A8FB0` / `#D8245F` | `DISK.png` 的印刷辅助线 |

## 改动

- 封面替换为 `Cover.jpg`（1280×1280），导出 640/1280 WebP + 1280 AVIF；删除按旧 3000×3000 合成图生成的 600/1200/2400 三档。
- `shell.css` 变量组整体翻转：`--black` 现在是纸白、`--white` 是墨蓝、`--acid` 是唱盘蓝；删掉整段失效的 `.audio-deck` 样式。
- 全部硬编码颜色按语义替换（40 余处），`color-scheme` 改 `light`，`theme-color` 改 `#F4F2EC`。
- 噪点由 `screen` 改 `multiply`，成为纸纹而非荧光。
- 新增 `.reg` 角标记，专辑封套左上青、右上洋红，呼应印刷对位。
- 通讯页阅读器：`paper` 类改为 `night`，按钮文案与 aria 标签随之调整（默认纸面，点击进入夜间模式）。

## 验证

- `npm run build` 通过；1440×980 与 390×844 截图见 `previews/paper-*.png`。
- 首页巨型标题的 `THE` 描边在纸底原先不可见（原为 `rgba(255,255,255,.22)`），改为 `rgba(15,63,151,.45)` 后可见。
- 对比度抽查（纸底 `#F4F2EC`）：墨蓝 15.3:1、唱盘蓝 8.6:1、次级灰蓝 4.8:1；网格检视标签由青字改为蓝底纸字。
- 通讯页夜间模式实测：点击后 `.editorial` 变 `night`，按钮文案切到 `PAPER MODE`，阅读面为 `#0B1B36`。
- `analyze-resources.py` 重新盘点：20 个文件 / 15 张图（新增 `Cover.jpg`），源素材哈希在运行前后一致。
