# IVORG · 社团先锋官网

Astro 7.3.8 + GSAP 3.15.0，三个独立页面；不再使用单文件或手写页面路由。

## 启动

本机已安装依赖，双击 `start-local.cmd`，或在本目录运行：

```powershell
npm run dev
```

打开 `http://127.0.0.1:4321/`。首次复制到另一台电脑后先运行 `npm ci`。要求 Node >=22.12；当前已在 Node 22.21.0 验证。不要直接双击 HTML 文件：源码为 Astro 组件，需要开发服务或先构建。

```powershell
npm run build
npm run preview
```

构建输出为 `dist/` 静态站，可部署到支持静态文件的托管环境。本次未执行部署或推送。

## 页面与责任边界

| 路径 | 文件 | 职责 |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | 大字宣言、真实专辑封面与曲目表卡片、鼠标坐标与视差 |
| `/discography/` | `src/pages/discography.astro` | 单张真实专辑 IVORG Index Zero、7 首曲目、封底元数据，**无播放器** |
| `/newsletter/` | `src/pages/newsletter.astro` | 三期示例通讯、索引、社论、技术表格、纸张/暗夜模式 |
| 公共布局 | `src/layouts/SiteLayout.astro` | 导航、时钟、字带、网格检视、动效开关、噪点与切场遮罩 |
| 页面动效 | `src/scripts/motion.js` | GSAP 横扫、标题解码、入场和取消/清理 |
| 真实数据 | `src/lib/release.js` | 专辑、7 首曲目、署名、4 场活动；每个值溯源到 `docs/resources/content-draft.json` |
| 示例内容 | `src/lib/data.js` | 仅剩三期示例通讯正文 |
| 样式 | `src/styles/` | 公共外壳及各页独立样式 |

`src/scripts/app.js` 使用 Astro ClientRouter 生命周期挂载和清理页面逻辑。页面交互位于 `home.js` 与 `newsletter.js`；专辑页目前无交互脚本。

## 播放行为

**当前没有任何播放功能。** 社团尚未提供音频，页面上只有曲目表、时长与署名，底部标注「试听音频待社团提供」。合成器试听、本地文件挂载、频谱与播放器组件已随 demo 数据一并移除（见 Git 历史）。不要在没有音源的情况下恢复播放控件。

## 内容真实性

- 专辑、曲目、时长、署名与活动信息来自 `resources/` 下的实体唱片与海报，经视觉转录并交叉校对，记录在 `docs/resources/content-draft.json`。
- 未提供的字段（BPM、音源引擎、音频地址、逐曲制作人、中文专辑名）一律缺省，不猜测。
- 通讯页仍是示例写作，页面自身标注 `DEMO ISSUES / ILLUSTRATIVE CONTENT`。

## 素材与协作

- `public/artwork/`：真实封面（AVIF + 三档 WebP）与四张活动海报 WebP，均由 `resources/` 导出。
- `assets/`：保留的素材源与未来图片、音频、字体目录。
- `resources/`：社团原始素材（4 张海报、专辑装帧 PNG、4 个 Affinity 源稿、`album.zip`）。**不要提交进 Git**，单文件数百 MB。
- `scripts/analyze-resources.py`：只读素材盘点与 AF 探针，产出 `docs/resources/manifest.json`。
- `previews/`、`exports/`：验收截图及导出产物，默认不提交。
- `docs/PI_HANDOFF.md`：达到额度交接阈值后的可接续记录。
- `docs/PI_NEWSLETTER_TASK.md`：实际发给 DeepSeek Flash Pi 的任务。
- `docs/ACCEPTANCE.md`：本轮验证记录。
- `docs/TOOLING.md`：架构取舍、工具与参考资料。

上一级 Mint Atelier 工作台及纯函数测试未改动。旧单文件展示端可通过 Git 历史恢复；当前源码以 `src/` 为准。

## Git

独立仓库，分支 `main`，origin 为 `https://github.com/koerimikan/ivorg-display-website.git`。本地开发不自动推送；`.astro/`、依赖、构建输出和预览均已忽略。