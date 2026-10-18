# IVORG 素材解析记录

检查日期：2026-10-17。仅盘点与读取，未修改源素材或接入页面。

## 文件与可解析范围

- 13 张图片：根目录 4 张活动海报，album/preview 下 9 张专辑装帧预览。
- 4 个 `.af`：back、DISK、jacket、side；文件头均为 `00 FF 4B 41 0C 00`，与 Affinity 容器签名相符。尚未解码其图层树、矢量路径、嵌入素材或可编辑文本，不能将 PNG 的视觉阅读视为源文件解析完成。
- album.zip：含上述 4 个 AF 和 9 张预览，另有目录项；已读取 ZIP 目录，未重复解压，未做逐文件内容一致性验证。
- 当前目录没有音频、视频或独立 SVG；没有发现可直接使用的动画时间线文件。
- 格式参考（社区解析实现）：https://github.com/Infrawrench/schist/blob/main/docs/affinity-format.md

## 图片目录

| 文件 | 像素尺寸 | 内容 / 用途 |
| --- | --- | --- |
| 3.png | 2603×3368 | 蓝色第 4 次社团活动海报，适合通讯归档 |
| 4.png | 1302×1684 | 粉色第 3 次活动海报，2026-04-11 |
| 6.jpg | 1280×1656 | 绿色第 2 次活动海报，2026-03-07 |
| 7.png | 1302×1684 | 红色第 1 次活动海报，2026-02-21 |
| album/preview/jacket_1.png | 3969×1985 | 左侧总署名、右侧封面；整张为跨页，不应直接当正方形封面拉伸 |
| album/preview/jacket_2.png | 3969×1985 | 实验字标与完整曲目表 |
| album/preview/jacket_3.png | 3969×1985 | 第 1、2 首歌词、署名与照片拼贴 |
| album/preview/jacket_4.png | 3969×1985 | 第 2、3 首歌词与署名 |
| album/preview/jacket_5.png | 3969×1985 | 第 4、5 首歌词与署名 |
| album/preview/jacket_6.png | 3969×1985 | 第 6、7 首歌词与署名 |
| album/preview/back_1.png | 2497×1952 | 封底：曲目、日期、发行编号、角色、条码 |
| album/preview/back_2.png | 2497×1952 | 目视近白空页；尚未判定是否印刷用途空白页 |
| album/preview/DISK.png | 2197×2197 | 光盘印刷稿，含明显青/洋红辅助线，需净化导出后使用 |
| album/preview/side.png | 917×1985 | 侧标 / 书腰式版面，含「雨、記憶、再会、そして旅立ち」 |

## 从预览图读出的专辑资料

下列内容为人工视觉转录，发布前应对照原稿复核；未从 AF 文本节点提取。

- 英文标题：IVORG Index Zero（图形标题呈 INDEX[0]）。
- 发行编号：IVORG-0001。
- 印刷日期：26.08.24（按图保留，未替社团确认正式发行日期）。
- Music：Antistar · Koeri · MySxan · Vantasy；另列全体 IVORG 成员。
- Mastering：Vantasy · Antistar。
- Art & Design：MySxan。

| # | 曲目 | 时长 | Vocal |
| --- | --- | --- | --- |
| 01 | Mirror of Traces | 2:31 | Hatsune Miku |
| 02 | ra1n.drops | 3:28 | Stardust · Shian · Minus · Haiyi |
| 03 | The Zeroth Reunion | 4:48 | Yue Zhengling · Luo Tianyi |
| 04 | Gnostalgic | 3:47 | Haiyi |
| 05 | Minty Bloody Tears | 3:09 | Hatsune Miku feat. Kasane Teto |
| 06 | Moonlight | 4:57 | Stardust |
| 07 | New Journey! | 3:16 | Stardust feat. Haiyi |

注意：总署名与具体曲目中的姓名大小写、空格写法不完全一致；不可擅自把 Vocal 姓名推断为具体软件引擎。第 4 次活动海报的日期文字看起来是「SAT, APR, 2026」，缺少明确日号，暂不补全。二维码尚未解码，不能据此生成 Discord 链接。

## 官网使用建议

1. HOME：用真正的专辑封面区域替换占位海报，保留摄影与角色关系。以蓝白装帧作为社团自有视觉主线，荧光黄可仅作交互提示。
2. DISCOGRAPHY：先接入这一张真实专辑及 7 首资料；音频缺失时明确显示「试听待提供」，不能用合成演示音冒充原曲。跨页作为可放大的装帧画廊。
3. NEWSLETTER：四张海报进入活动归档，日期与地点作为独立数据；第 4 期日号待核实。
4. 动画：将字标、星芒、条码、角色、背景照片分别导出后，才可实现真实的分层视差、封套展开和 CD 抽出；目前 PNG 仅支持整图运动。
5. 保留 AF/ZIP 在 resources；为网页另外输出裁切确认过的 WebP/AVIF 和净版 SVG/透明 PNG，不让数百 MB 源稿进入浏览器资源链路。

后续源文件深解析优先通过 Affinity 导出 SVG/PDF（保留文字或路径）以及分层透明 PNG，核对字体、图层和边界；当前未安装或运行第三方 AF 解析器，未声称支持无损往返。
