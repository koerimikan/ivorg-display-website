# @atelier/client

工作区内的宿主开发 SDK；当前 private，未发布到 npm。客户端源代码不依赖 IVORG 页面脚本。浏览器分发文件通过 `npm run build --workspace @atelier/client` 生成到 dist/atelier-client.js。

## Astro 官方宿主

在 Astro 配置中导入 `atelier` from `@atelier/client/astro`，并把 `atelier({ enabled: process.env.COMPANION_P1 === '1' })` 放入 integrations。宿主自己的 workbench/atelier.host.json 指定 canonical Spec、对象注册表、路由、布局和可选动效模块；参考 apps/ivorg-website/ 的实际配置。构建期不注入 Bridge。

## 通用 Vite：只读接入

```js
import { defineConfig } from 'vite';
import atelier from '@atelier/client/vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 4321, strictPort: true },
  plugins: [atelier({ routes: { '/': 'page.home' } })]
});
```

插件仅用于 serve，提供修订清单与 Bridge 注入，明确返回 readOnly=true、sourceMapping=false。该配置不生成对象注册表，也不提供 React/Vue/Svelte AST 反写；对象图需宿主独立提供。控制面在 4323，跨 Origin 校验继续使用精确 origin/source/epoch/nonce。

## 独立 ESM

可将构建生成的 dist/atelier-client.js 作为开发资源通过 script type=module 加载；宿主仍需提供版本清单、路由映射与源码身份适配。仅插入脚本不意味着获得稳定 AST 编辑能力。

## 动效

`@atelier/client/motion` 导出 registerHostMotion。业务模块拥有动效，开发期的宿主适配模块负责注册；不要让公共页面导入工作台服务端或历史页内工具栏。

凭据、源码 Apply、权限判断不在客户端完成。生产构建应通过仓库 residue 门禁；不要把开发 Bridge 打进公众站点。
