# 架构与协作参考

## 选择

- 原生 Web Audio：合成器、频谱及本地文件处理不需要额外音频库。
- Astro ClientRouter：独立可索引页面与公共布局；不用继续扩张手写路由。
- GSAP：精确安排遮罩、逐层入场和回收动画；不引入额外平滑滚动库改变系统滚动。
- Swup 与 Barba 是轻量多页切换的候选方案。本项目已选 Astro，不再叠加第二套路由。
- 当前 Node 22.21.0 满足 Astro 7.3.8 的要求；7.4.0 要求更高的 Node 补丁版本，因此没有修改全局运行时。

## 官方资料

- [Astro View Transitions 与生命周期](https://docs.astro.build/en/guides/view-transitions/)
- [Astro 路由 API](https://docs.astro.build/en/reference/modules/astro-transitions/)
- [GSAP context](https://gsap.com/docs/v3/GSAP/gsap.context()/)
- [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/)
- [Swup 容器与页面生命周期](https://swup.js.org/getting-started/how-it-works/)
- [Barba 生命周期](https://barba.js.org/docs/getstarted/lifecycle/)

## Pi 协作

实际使用本机 Pi 1.3.0 / deepseek/deepseek-flash。通讯 Astro 页面和阅读器交互由 Pi 生成，Codex 检查并集成；初始直接工具调用只返回了 DSML 文本，未发生文件修改，因此改用 no-tools 结构化文件输出，再由 Codex验证路径并写入。未修改全局模型或凭据配置。

本轮操作参考了本地 pi-agent 技能。根据技能的引用要求记录其所属资料库论文（已核对 arXiv 当前记录）：

Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). *Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents.* [arXiv:2609.00065](https://arxiv.org/abs/2609.00065), revised 2026-09-02. [DOI](https://doi.org/10.48550/arXiv.2609.00065).

## 视觉方向

用户指定米哈游、Monster Siren Records 与绝区零作为方向参考。本项目不复制其角色、商标或源码；三个唱片封面由原创程序化 SVG 构成。