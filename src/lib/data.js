// Illustrative releases and credits. Oscillator previews do not contain vocal-library audio.
function tracks(prefix, rows) {
  return rows.map((row, index) => ({
    id: `${prefix}-${index+1}`, title: row[0], cn: row[1], bpm: row[2], seconds: row[3],
    notes: row[4], vocal: ["Hatsune Miku", "Mai", "重音テト", "INSTRUMENTAL"][index],
    engine: ["VOCALOID / CONCEPT", "SynthV / CONCEPT", "SynthV / CONCEPT", "OSCILLATOR STUDY"][index],
    producer: ["KIRI", "NORA", "MIO", "IVORG LAB"][index], lyrics: ["MIO", "KIRI", "NORA", "—"][index],
    tuning: ["NORA", "MIO", "KIRI", "—"][index]
  }));
}
export const ALBUMS = [
  { id: "IVORG-01", title: "THE UNHEARD", cn: "未闻之境", date: "2026.10.12", genre: "VOCAL SYNTH / ELECTRONICA",
    description: "在合成歌声与有机节拍的交界，记录那些尚未命名的情绪。四段声音草稿，写给每一个不愿被默认的人。",
    tracks: tracks("01", [["UNHEARD","未闻之境",120,32,[57,64,69,72,76,72,69,64]],["GLASS PROTOCOL","玻璃协议",132,40,[54,61,66,69,73,69,66,61]],["LOW ORBIT","低轨道来信",108,48,[50,57,62,65,69,65,62,57]],["AFTERIMAGE","余像",126,32,[60,67,72,75,79,75,72,67]]]) },
  { id: "IVORG-02", title: "SOFT MACHINES", cn: "柔性机械", date: "2026.08.23", genre: "IDM / AMBIENT / SYNTH",
    description: "把机械的精确与情绪的游移放进同一个声场。金属、呼吸与脉冲，逐渐构成柔软的秩序。",
    tracks: tracks("02", [["SOFT MACHINES","柔性机械",118,40,[53,60,65,68,72,68,65,60]],["CHROME HEART","铬色心脏",140,32,[55,62,67,70,74,70,67,62]],["HUMAN ERROR","人类误差",112,48,[52,59,64,67,71,67,64,59]],["SLEEP MODE","休眠模式",96,48,[48,55,60,63,67,63,60,55]]]) },
  { id: "IVORG-03", title: "COMMON GROUND", cn: "共同声场", date: "2026.05.09", genre: "COLLECTIVE / FUTURE BEATS",
    description: "不同的声音不必互相覆盖。在共同的网格上，保持自己的频率。一次关于协作、留白与连接的合成实验。",
    tracks: tracks("03", [["COMMON GROUND","共同声场",124,40,[59,66,71,74,78,74,71,66]],["CROSSFADE","交叠",128,32,[56,63,68,71,75,71,68,63]],["OPEN CHANNEL","开放频道",136,32,[58,65,70,73,77,73,70,65]],["WE REMAIN","我们仍在",104,48,[51,58,63,66,70,66,63,58]]]) }
];
export const ALL_TRACKS = ALBUMS.flatMap((album, albumIndex) => album.tracks.map((track, trackIndex) => ({...track, albumIndex, trackIndex})));
export const ISSUES = [
 {number:"04",date:"2026.10.12",title:"秋季合成器声学与调校工坊纪要",tag:"SYNTHESIS / TUNING / WORKSHOP",minutes:"06",
  deck:"从一个振荡器到一句可被感知的歌声：把注意力从参数的数量，转向声音内部的关系。",
  quote:"调校不是把每一个音符推向完美，而是为情绪留下可以呼吸的误差。",
  sections:[
   {title:"从听觉出发，而非从参数出发",text:["本期示例工坊以减法合成为切入口。参与者先用单振荡器建立音色骨架，再逐步加入包络、滤波与调制，比较每一次改变如何影响听觉重心。","一段具有表现力的声音，不一定拥有复杂的信号链。我们尝试先写下想要传达的情绪，再决定哪些参数值得改变。"],table:[["OSCILLATOR","Triangle / Sawtooth","先比较谐波密度，再选择波形"],["FILTER","Low-pass / 1.8 kHz","为人声主体预留频段"],["ENVELOPE","A 12ms / D 180ms / R 240ms","让起音与尾音参与表达"],["MONITORING","Level-matched A/B","避免把更响误认成更好"]]},
   {title:"把呼吸写进音高曲线",text:["以四小节合成歌声为例，我们将音头、持续音和句尾分开处理。音头决定方向感，持续音塑造稳定度，而句尾常常承载整句话的情绪。","调校草稿与器乐草稿同时迭代。编曲不是人声完成后的包装，而是与歌声互相回应的空间。"]},
   {title:"下一次，带着一个问题回来",text:["保留原始版本与调整版本，记录每次修改的理由。下一次工作坊将围绕这些差异展开讨论，而不是只展示最终结果。","本篇为社团通讯版式示例，参数仅用作创作练习的起点，不代表固定的音频工程标准。"]}]},
 {number:"03",date:"2026.09.06",title:"社团放映会与新专辑企划启动",tag:"SCREENING / ALBUM / COLLABORATION",minutes:"05",
  deck:"在黑暗中共同聆听，然后在白纸上重新开始。一次关于影像节奏、声音叙事与合作方法的记录。",
  quote:"一张专辑不是几首歌的集合，而是我们共同走过的一段距离。",
  sections:[
   {title:"把聆听放回公共空间",text:["放映会的示例策划以无对白影像与电子音乐片段交替展开。讨论从叙事进入节奏：同一段声音，在不同画面中会产生怎样不同的重量？","我们将观看时的第一反应写在便签上，再按空间、色彩与动态归类。视觉组与音乐组由此获得了一份共同的词汇表。"]},
   {title:"先确定共同语言，再分配工作",text:["新专辑企划从三项限制开始：一个共同的声音动机、一组克制的颜色，以及一个能够容纳不同作者的叙事问题。","每一个草稿都经过交叉试听。解释自己的选择，也为别人的选择留下空间。"],table:[["CONCEPT","Common Ground","保留个体，建立连接"],["AUDIO","4 demonstration studies","合成歌声与器乐并置"],["VISUAL","Obsidian / Signal Yellow","结构先于装饰"],["WORKFLOW","Sketch → Review → Iterate","每轮保留可比较的版本"]]},
   {title:"把未完成也放进档案",text:["把草稿、试听反馈与封套排版过程一起收录进通讯。创作的价值不只存在于发布那一天。","这份示例企划不代表真实活动安排；正式使用时应替换为社团的实际日程与负责人。"]}]},
 {number:"02",date:"2026.06.21",title:"纳什均衡与多声部和声编配笔记",tag:"ARRANGEMENT / SYSTEMS / ESSAY",minutes:"07",
  deck:"借用博弈的语言思考声部之间的关系：一个声音的选择，如何改变其他声音可以存在的空间？",
  quote:"好的多声部，不是每个人都站在中心，而是每个人都知道如何让出中心。",
  sections:[
   {title:"一个类比，不是一条定理",text:["本篇把多声部编配视作一组相互回应的选择。纳什均衡在这里是启发式类比，而非对音乐结构的数学证明。","当主旋律进入高密度乐句时，伴奏可以减少事件数量；当人声留出空白时，器乐动机获得叙事的机会。"]},
   {title:"为每一条线分配不同的任务",text:["比较节奏密度、音区与运动方向。让这些维度有所区分，往往比为每条声部增加更多音符更有效。"],table:[["LEAD","叙事 / 前景","保留可被记住的动机"],["COUNTERPOINT","回应 / 位移","避免持续争夺同一音区"],["HARMONY","色彩 / 支撑","用留白维持整体重心"],["BASS","方向 / 地面","与节奏组建立稳定关系"]]},
   {title:"在冲突与协作之间切换",text:["并非所有声部都需要始终和谐。短暂的拥挤、重叠与不稳定，可以成为段落转折的力量；关键在于它们是否服务于作品。","把所有声部独奏一遍，再回到合奏中。单独成立与共同成立，是两种不同的判断。"]}]}
];