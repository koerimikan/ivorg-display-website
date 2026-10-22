# IVORG Website

纯 Astro 社团官网及 Atelier 官方宿主。包含三条路由：/、/discography/、/newsletter/。业务代码不导入工作台内核或页内工具栏。

从工作区根安装一次依赖后，执行 `npm run dev --workspace @ivorg/website` 或根目录 `npm run dev`。生产构建输出本目录 dist/。

workbench/ 保存本项目的对象、Spec、宿主描述与开发期动效适配。它不包含控制面实现。Astro 配置仅在 COMPANION_P1=1 时启用 @atelier/client/astro；根目录 `npm run dev:workbench` 编排双服务。

真实唱片是 IVORG Index Zero、7 首曲目，当前无音频播放器；Newsletter 为示例内容。数据与设计规范见 ../../docs/IVORG_WEBSITE_SPEC.md。根 resources 与 docs/resources 保留素材及来源记录；不要提交本地 .companion 凭据。
