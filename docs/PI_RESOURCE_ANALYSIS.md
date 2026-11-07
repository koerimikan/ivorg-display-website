# Pi Agent 任务书：IVORG 真实素材解析

## 可直接交给 Pi 的指令

你负责解析 仓库根目录下的 `resources/` 中的社团素材，为后续 Astro 官网使用建立可靠的数据和素材索引。本轮只做解析与交付，不修改网站页面、不替换演示数据、不发布、不推送 Git。先阅读本文件和 `docs/RESOURCE_AUDIT.md`，再检查当前文件；文件内容优先于历史交接中的描述。

默认使用已配置的 `deepseek/deepseek-flash`。不要安装或切换全局模型配置，不读取或输出认证文件。不要将 AF、ZIP 或原始图片整体作为文本输入模型。

## 现有项目与输入

- 项目使用 Astro + GSAP，三个独立页面：HOME、DISCOGRAPHY、NEWSLETTER。
- `src/lib/data.js` 当前仍有演示内容；本轮不要覆盖。
- 素材目录共 18 个文件：13 张图片、4 个 AF、1 个 ZIP。
- `resources/3.png`、`4.png`、`6.jpg`、`7.png`：四次社团活动海报。
- `resources/album/{back,DISK,jacket,side}.af`：专辑设计源稿。
- `resources/album/preview/`：9 张装帧 PNG。
- `resources/album.zip`：目录记录包含上述 4 个 AF、9 张 PNG，暂未做逐文件哈希一致性验证。
- 四个 AF 的头部均为 `00 FF 4B 41 0C 00`，与 Affinity 容器签名相符；不是已完成图层解析的证据。
- 无音频、视频或独立 SVG。不得虚构试听地址、BPM、音源引擎、发行日期或动画时间线。

## 已有视觉转录，需复核而非盲信

专辑：IVORG Index Zero，图形标题 INDEX[0]，编号 IVORG-0001。封底日期文字为 `26.08.24`；保留原文，正式日期待社团核实。

| # | 曲名 | 时长 | Vocal |
| --- | --- | --- | --- |
| 01 | Mirror of Traces | 2:31 | Hatsune Miku |
| 02 | ra1n.drops | 3:28 | Stardust · Shian · Minus · Haiyi |
| 03 | The Zeroth Reunion | 4:48 | Yue Zhengling · Luo Tianyi |
| 04 | Gnostalgic | 3:47 | Haiyi |
| 05 | Minty Bloody Tears | 3:09 | Hatsune Miku feat. Kasane Teto |
| 06 | Moonlight | 4:57 | Stardust |
| 07 | New Journey! | 3:16 | Stardust feat. Haiyi |

总署名：Music 为 Antistar、Koeri、MySxan、Vantasy 及全体成员；Mastering 为 Vantasy、Antistar；Art & Design 为 MySxan。个别页面大小写与空格不同，保留原文并标记差异。

活动海报：7.png 为第 1 次 / 2026-02-21，6.jpg 为第 2 次 / 2026-03-07，4.png 为第 3 次 / 2026-04-11，3.png 为第 4 次。第 4 次海报日号不明确，不能根据文件名补日期。二维码未解码，不能猜 Discord 邀请链接。

## 执行顺序：每步有产物再继续

### 1. 可重复的文件盘点

编写一个本地脚本，只读取 resources，生成清单。每项包含相对路径、字节大小、SHA-256、扩展名、实际格式识别依据。图片增加尺寸、颜色模式、是否存在 Alpha 通道；区分「有 Alpha 通道」与「实际存在透明像素」。不要仅凭扩展名判断格式。

ZIP 使用目录读取及流式哈希比对，不重复解压数百 MB 文件。拒绝越界路径，不执行压缩包中的任何内容。记录文件是否与已解压版本一致。

优先零依赖；若使用本机现有 Pillow，可声明此依赖。不要为本任务擅自修改网站 package.json / lockfile。

### 2. 素材内容与结构化资料

从现有 PNG/JPG 整理专辑、7 首曲目、总署名、每曲分工、4 次活动。能实际查看图片才可以报告视觉识别；模型不支持图片时保留已有转录并标注「待视觉复核」，不要声称已看图。OCR 输出只是候选，尤其检查实验字体的 0/O、1/I、大小写和中文姓名。

每个字段保留 `sourcePath`、原文 `rawText`、标准化 `value`、`status`（verified / transcribed / uncertain / missing）和必要的备注。未知值用 null；人员署名保留数组，不能把总署名自动分摊到每首曲目。音频 URL、BPM、软件引擎目前均为 null。歌词只在用户本地按任务需要整理，不联网搜索或补写。

### 3. AF 深解析可行性审查

先只读检查容器和本机可用工具，再决定是否能安全解析副本。社区格式线索：https://github.com/Infrawrench/schist/blob/main/docs/affinity-format.md 。这是社区实现，不是官方兼容保证；先读代码/说明，禁止直接下载执行未知安装脚本。

分别记录：容器识别、内嵌预览提取、图层树、文本节点、嵌入位图、矢量路径、画板尺寸、字体引用，每项标记 extracted / unsupported / not_attempted / failed，并附可核对的证据。不得把从 preview PNG 转录的文字标成 AF 文本提取。

无法可靠解码时到此停止源稿解析，输出具体限制与 Affinity 导出清单：净版 SVG/PDF、保留文字版本、文字转曲版本、独立透明角色 PNG、背景照片、字标、几何装饰、裁切后的正封面与净版光盘。需要原应用交互时记录待办，不擅自覆盖源稿。

### 4. 官网映射建议

- HOME：正封面和主视觉；jacket_1 是 3969×1985 跨页，右半才是封面候选，不能整图拉伸成正方形。
- DISCOGRAPHY：真实专辑 + 7 首记录 + 可放大装帧画廊。尚无音乐，不能用合成示例冒充原曲。
- NEWSLETTER：海报与活动事实；不要凭海报虚构社论正文。
- DISK.png 含青/洋红印刷辅助线；不直接当成最终网页光盘贴图。
- back_2.png 目视近白；实际检查像素后记录，不能未经核实删除。
- 当前图片是合成平面；整图视差可行，角色与背景独立运动需要分层导出。
- 输出推荐裁切范围和优化规格即可，本轮不破坏性裁切、不改色、不自动抠图。

## 允许写入的交付文件

1. `scripts/analyze-resources.py` 或单一等效 Node 脚本，二选一。
2. `docs/resources/manifest.json`：自动盘点与 ZIP 一致性结果。
3. `docs/resources/content-draft.json`：待审核的专辑、曲目、活动和来源记录。
4. `docs/resources/AF_ANALYSIS.md`：AF 能力矩阵、真实尝试、失败原因、导出需求。
5. `docs/resources/INTEGRATION_PLAN.md`：三页素材映射、待确认字段、下一步最小任务。

不修改 resources、src、public、依赖文件或原有 handoff 文档；大文件不要加入 Git。不要执行 commit/push。开始前检查当前 Git 状态，保留用户改动。临时提取物仅写 `previews/resource-analysis/`，避免覆盖已有文件。

## 验收清单

- 18 个源文件全部有 manifest 记录，13 张图片尺寸正确，4 个 AF 状态明确。
- ZIP 与现有文件逐项核对或清楚记录未核对原因。
- JSON 可被标准解析器读取，所有 sourcePath 指向实际存在的 resources 文件，路径使用项目相对路径。
- 源素材哈希在执行前后保持不变；网站源码无改动。
- 7 首曲目均有原始来源；未知 BPM/音频/引擎无伪造；第 4 次活动日号保持未知。
- 报告清楚区分「自动文件检查」「PNG 视觉转录」「AF 内部提取」，不得混称完整解析。
- 最后报告产物路径、执行命令、通过/未通过项、阻塞原因和下一项最小任务。

## Pi 工具调用兼容性

此前本机 Pi 直接工具模式曾输出原始 DSML，未真正执行。若再次发生，立即报告「工具未执行」，不要把输出的命令视为已运行。可改用已验证的 `--no-tools --mode json -p` 方式，由主代理附上本任务书、现有审计和盘点结果；Pi 只返回允许路径的完整文件内容 `{ "files": [{ "path": "...", "content": "..." }] }`，主代理验证后落盘并执行测试。无工具模式不能声称完成哈希或 AF 解码。

此文档是解析任务交接，不代表已派发运行。Pi CLI 使用及协作背景见 `docs/TOOLING.md`、`docs/PI_HANDOFF.md`；历史运行状态应重新检查。
