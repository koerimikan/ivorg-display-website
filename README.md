# PHASE / 相位 · 先锋展示端

此目录存放社团展示端及其后续可复用资源。当前首个交付物为零构建依赖的 `club-avant-garde.html`，双击即可运行；Google Fonts 与 GSAP 使用 CDN，离线时使用字体和动效回退。

## 目录约定

| 路径 | 用途 |
| --- | --- |
| club-avant-garde.html | 自包含展示页入口；目前 CSS、SVG 与脚本内联 |
| core/ | 未来拆分的数据契约、状态、提案、校验与导出纯函数 |
| motion/ | 未来可复用的切场、解码、视差、光标与环境动效 |
| assets/svg/ | 原创 SVG 立绘、几何图案与纹理源文件 |
| assets/images/ | 有授权来源的摄影、插画与海报 |
| assets/audio/ | 社团原创曲目与试听音频 |
| assets/fonts/ | 未来需要的字体文件及其许可说明 |
| experiments/ | 隔离的组件、排版和动效实验 |
| docs/ | 设计规范、契约说明、素材来源和验收记录 |
| previews/ | 浏览器验收截图、录屏与展示预览 |
| exports/ | 用户主动导出的 CanvasState 和发布交付物 |

这些目录是后续模块边界，当前不为目录结构而拆散单文件入口，也不引入构建工具。

## 与既有工作台的关系

上一级的 `tech-panel-lab.html`、`apply-patch.test.cjs` 与 `create-proposal.test.cjs` 保持原位，继续作为工作台和契约参考。本展示端不覆盖或搬动这些文件。

## 内容约定

页面中的社团名、歌姬档案与曲目为设计演示内容，发布前替换为真实信息。浏览器合成的试听为演示音序，并非真实社团作品。
