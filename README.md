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
| `/` | `src/pages/index.astro` | 大字宣言、主打专辑与最新通讯海报、鼠标坐标与视差 |
| `/discography/` | `src/pages/discography.astro` | 三张专辑、12 段合成试听、曲目分工、页面专属播放器 |
| `/newsletter/` | `src/pages/newsletter.astro` | 三期通讯、索引、社论、技术表格、纸张/暗夜模式 |
| 公共布局 | `src/layouts/SiteLayout.astro` | 导航、时钟、字带、网格检视、噪点与切场遮罩 |
| 页面动效 | `src/scripts/motion.js` | GSAP 横扫、标题解码、入场和取消/清理 |
| 音频核心 | `src/lib/audio.js` | Web Audio 合成器、本地音频、频谱总线、播放状态 |
| 示例内容 | `src/lib/data.js` | 专辑、曲目与期刊的数据 |
| 样式 | `src/styles/` | 公共外壳及各页独立样式 |

`src/scripts/app.js` 使用 Astro ClientRouter 生命周期挂载和清理页面逻辑。各页面交互分别位于 `home.js`、`discography.js`、`newsletter.js`。

## 播放行为

播放器仅出现在专辑页。离开时暂停；同一会话返回时保留选曲和进度，需再次点击播放。切换展示专辑不会中断当前试听。支持本地音频、进度、音量、静音和上下曲；频谱来自 AnalyserNode。

全部专辑、声库标签、署名、日期和通讯都是创作示例。振荡器试听不包含真实歌姬人声；本地音频仅保存在浏览器当前会话，不上传服务器。

## 素材与协作

- `public/artwork/`：新版唱片封面 SVG；页面内联版本由 `src/lib/artwork.js` 生成。
- `assets/`：保留的素材源与未来图片、音频、字体目录。
- `previews/`、`exports/`：验收截图及导出产物，默认不提交。
- `docs/PI_HANDOFF.md`：达到额度交接阈值后的可接续记录。
- `docs/PI_NEWSLETTER_TASK.md`：实际发给 DeepSeek Flash Pi 的任务。
- `docs/ACCEPTANCE.md`：本轮验证记录。
- `docs/TOOLING.md`：架构取舍、工具与参考资料。

上一级 Mint Atelier 工作台及纯函数测试未改动。旧单文件展示端可通过 Git 历史恢复；当前源码以 `src/` 为准。

## Git

独立仓库，分支 `main`，origin 为 `https://github.com/koerimikan/ivorg-display-website.git`。本地开发不自动推送；`.astro/`、依赖、构建输出和预览均已忽略。