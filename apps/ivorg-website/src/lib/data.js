// Newsletter issues. Copy is the club's own writing, taken from the shared drafts and the designed
// newsletter pages (IVORG Newsletter Designs, pages 6-7). Unfinished notes are left out. Plain text only.

export const ISSUES = [
  {
    number: '01',
    date: null,
    title: 'VOCANEWS, Vocaloid 7 and three songs from Satokan no Kanzume',
    tag: 'VOCANEWS / VOICEBANKS / SONG SHARING',
    minutes: '11',
    deck: 'News and announcements about songs, artists and upcoming voicebanks, the Vocaloid 7 announcement, and a producer spotlight from our song-sharing meetings.',
    quote: 'I hope that more and more people continue to discover the overall Vocaloid scene for what it is on the inside, this beautiful community that are more fans of each other than simply fans of the characters that represent us.',
    sections: [
      {
        title: 'VOCANEWS: recent news',
        text: [
          'Compiled by captainketchup, watashiNoHeritage and Koeri.',
          'The three demo songs for Adachi Rei are all quite popular! The three songs are Yoyo2 by r-906, Syzgy by Iyowa, and Walking with you by 32ki/Satsuki.',
          'Ryo has posted an original song–two original songs–for the first time in TEN YEARS since “The Name of the Sin”! The two songs were both for Project Voltage, the official collaboration between Hatsune Miku and Pokemon: “LEGENDS” and “1996.”',
          'In the description of the music video for both of ryo’s new songs on YouTube, one may notice that Machigerita is credited in the “Special Thanks” and story concept sections. Shortly after these music videos were uploaded, Machigerita posted on X (Twitter) that he plans to return to making Vocaloid music shortly, after almost nine years!',
          'In other recent news, a new Vocagaze/Mikugaze/Vocaloid shoegaze compilation album was released earlier this month: vocagazer! With an illustration by underground-popular Vocaloid fanartist eletenshi, it contains songs from a mix of Western and Japanese shoegaze producers with an exciting feature from popular vocagaze producers nerdneko and (ex.) happyender girl.',
          'Another trending compilation album recently has been EGO ELECTRIC, themed around the “spicy” and “sweet” sides Otomachi Una and featuring a very exciting lineup of many well-known Japanese and Western producers, the most notable being iroha(sasaki), with the track “Sugar Coffin”!',
          'In the UTAU community, to celebrate Sekka Yufu’s 18th anniversary, many underground UTAU producers came together to create the compilation album “Yuki Shirube”!',
          'Flavor Foley just announced that they’re going on an indefinite hiatus after November, saying that they want to work on other solo creative projects in the meantime.',
          'Twindrill tweeted a teaser video that confirms that Teto is coming to Fortnite. It’s been anticipated since even before Miku came to the game, but it’s still surprising. It’s still hard for a lot of us to believe that Teto has suddenly become this popular!'
        ]
      },
      {
        title: 'Voicebanks',
        text: [
          'Adachi Rei — Originally a real life robot, Rei was made into an UTAU bank notable for not having a voice actor, instead being entirely synthesized by editing sine waves and VST instrument samples. Following her popularity that let her rise to be the second most popular UTAU bank behind Teto, Rei was the first VOCALOID FAN-Ding, a new initiative for crowdfunding Vocaloid voicebanks based on existing characters. She received a simultaneous V5 and V6 release, her V5 being a concatenative bank similar to her UTAU, and her V6 being an AI voicebank trained on her UTAU samples.',
          'Bennett Fantasia — Bennett Fantasia is a native English Voisona voicebank by the new Australian voicebank development company Vocreatures, previously known for their UTAU voicebanks. He’s voiced by the producer Du Du Danyon and the third commercial voicebank on any software with an Australian accent after Sweet Ann (Vocaloid 2) and Ninezero (SynthV). He is the most technically impressive Voisona release to date with a listed optimum range from B2 to A5 and classical singing training. Outside of his operatic capabilities, Bennett’s Singing Styles also let him sing in a theatrical or rock style, giving him incredible genre versatility not seen in previous commercial opera voicebanks.',
          'Ryone Yami — After his first UTAU release in 2010 and various UTAU appends released in that time, Yami is finally coming to a commercial engine. Although his voice actor has worked on voicebanks for Vocaloid and Synthesizer V, this marks their biggest project for Yami, which is stated to be the last voicebank that will be released for the character. (Note: Yami Ryone is listed as non-binary in the official character bio, but uses masculine pronouns.)',
          'JOVIE — Jovie is the 4th installment in the Tone Chroma series of voicebanks by American vsynth company Eclipsed Sounds. She’s the first commercial voicebank on any software with a Southern American accent, and is specialized in American folk genres. She has a mature mezzo-soprano voice, most often compared to the likes of Dolly Parton.',
          'SeeU Re:Voice — 15 years after her Vocaloid release, SeeU is finally returning with a new voicebank. As the first Korean Vocaloid release, SeeU has remained the face of the Korean fandom despite newer releases on other softwares. SeeU’s voice provider was unavailable to reprise the role, so a new voice actress was found, meaning SeeU Re:Voice. The switch to VOX Factory means SeeU is finally getting multilingual support and able to sing in English and Mandarin. Her announcement implied that she may come to more engines in the future based on fan interest, though nothing is confirmed at this point.',
          'MEW — The 6th installment in the Yumenokesshou series of voicebanks by Bushiroad, Mew is based on Nakamachi Arale from the Bandori franchise, leader and vocalist for the band Mugendai MewType.',
          'Huan Zhang & Shao Ling — Following the release of their first two bel canto voicebanks for SynthV at the end of last year, a baritone and mezzo soprano, SV released a tenor and soprano voice to add to the opera options on the software. Both voicebanks are native in Mandarin, though as first party Dreamtonics voices they are able to sing in languages currently in beta testing, including French, Portuguese, German, and Italian.',
          'Kohki, Nanami, Rochelle — Three new first party Dreamtonics banks, two Japanese voices and one English. Kohki is an androgynous tenor voice, Nanami is a J-Pop voice though stated to be versatile across popular genres, and Rochelle is a feminine R&B voice similar to recent male R&B voicebank releases like Danny and Marvin.'
        ],
        columns: ['VOICEBANK', 'ENGINE', 'RELEASE', 'PRICE'],
        tableLabel: 'Voicebanks — engine, release and price',
        table: [
          ['Adachi Rei', 'VOCALOID', 'October 9, 2026', '$90 / $135'],
          ['Bennett Fantasia', 'VoiSona', 'September 27, 2026', '13,200 JPY (~$84)'],
          ['Yogatari Tobari', 'VOCALOID (FAN-Ding)', 'March 2027; preorders through October 30', 'Not listed'],
          ['Ryone Yami', 'VOX Factory', 'Q4 2026', 'Unknown'],
          ['JOVIE', 'Synthesizer V', 'September 18, 2026', '$100'],
          ['SeeU Re:Voice', 'VOX Factory', 'To be announced', 'Unknown'],
          ['MEW', 'Synthesizer V', 'December 23, 2026; preorders through November 5', 'To be confirmed'],
          ['Huan Zhang & Shao Ling', 'Synthesizer V', 'September 25, 2026', '$70'],
          ['Kohki, Nanami, Rochelle', 'Synthesizer V', 'September 29, 2026', '$70']
        ]
      },
      {
        title: 'Vocaloid 7',
        text: [
          'On October 9th, 4 years after the release of Vocaloid 6, Vocaloid 7 was announced to be releasing on November 11th.',
          'Despite cries that V7 is coming too soon after V6, V6 actually had a slightly longer than average lifespan among Vocaloid editors. The gap between major versions ranges from 1,261 days as the shortest (V1 to V2) to 1,565 days as the longest (V2 to V3), with V7 coming 1,490 days after V6. V6 also has exactly as many voicebank releases as V3 at 51, far higher than the 16 voicebanks released for V5. V3 and V4 just seem more impactful in fans’ minds due to the large number of new iconic characters who debuted on V3, and because V4 was followed by the largely ignored and underwhelming V5. Despite V6 having as many voicebanks as V3, many of them remain unknown because they’re part of the Silhouette Series, a set of 20 mascotless voicebanks catering to more traditional DTM producers that lack the traditional character marketing associated with Vocaloid releases. Among the mascot vocals who debuted on V6, releases like Ci-chan and Tsumugi also proved somewhat unpopular among fans due to being based on VTubers.',
          'The changes coming in V7 address the biggest complaints people had with V6, taken from feedback from VX-β. VX-β was an experimental editor given limited distribution in 2023 and a commercial release in 2024, stated to offer features using “beta” research technology Yamaha was considering implementing in future vocal synthesis software. While some elements originating in VX-β came to V6, such as several V6 voicebanks like Kazehiki and Gekiyaku first releasing for VX-β, major changes to the synthesis itself were not implemented. The two biggest differences between VX-β and V6 were an improved vocoder that fixed the “engine noise” V6 was known for, along with “Singing Styles”, an equivalent to Vocal Modes on Synthesizer V or Vocal Styles on Voisona. Now named “Voice Types” in V7, these are voicebank-specific automatable parameters that change the tone of a voice, offering more functionality than the Append voicebanks that Vocaloid has traditionally sold separately for this purpose.',
          'As of now, the only new original voicebank announced for V7 is Gumi, who is releasing simultaneously with the V7 editor. Recorded with the same dataset as her Synthesizer V 2 voicebank, her Voice Types are the exact same as the Vocal Modes offered on SV2, the difference between the two voicebanks coming from engine differences. This is similar to the difference between Gumi’s V6 and Synthesizer V 1 voicebank, who were also both developed using a single dataset, but these voices differed in that Gumi’s SV1 offered Vocal Modes, whereas Gumi V6 did not, instead only offering one alternative tone through her Solid Append voicebank, sold separately.',
          'Beyond Gumi, all 6 FAN-Ding voicebanks in production planned for a V6 release “will instead be provided as VOCALOID7-compatible voicebanks,” with LUCI releasing the same day as V7. As well, Miku and Rei V6 were announced to have V7-compatible versions in development. The V7 editor will also be compatible with all V3-V6 voices, though using their original synthesis rather than the new vocoder.',
          'V7 is priced at $129, with preferential upgrade pricing available for those with any Vocaloid editor between V3 and V6. Standard upgrade pricing is $69, with a launch discount of $39 until December 20th. Similar to the V6 editor, V7 will be bundled by default with Asa, though no information is currently available regarding if this version of Asa will be a new voicebank, a V7 compatible upgrade like Miku, or the V6 version of the voice currently available.'
        ]
      },
      {
        title: 'Three songs from Satokan no Kanzume',
        text: [
          'By Alexandra Poulos.',
          'Satokan no Kanzume (砂糖の缶詰), or known officially in English as “canned sugar,” or just Satokan for short, is a producer who has been making songs exclusively with UTAU voicebanks since 2023. They mainly use Utane Uta, also known as Defoko, but also use Adachi Rei as well as most of the main “VIPPERloids”: Kasane Teto, Momone Momo, Yokune Ruko, Namine Ritsu, and Sukone Tei, whom I all gave brief character introductions for in my presentation. Satokan has also made their own voicebank, Touko. They’ve been quite an underground producer–all songs under 100K views–until recently, their latest song from this recent Summer season of Vocacolle, called “The Great Voice Synth Showdown,” which is their first song to surpass 100K views! Satokan has one album so far, “Let’s go! Cunning 30 Children’s Center” (レッツゴー！三十〇缶児童館), and also participated in the collaboration album “Defoko yo Eien ni!!” (デフォ子よ永遠に！！).',
          'Speaking of Defoko, she acts as the main character of the Satokan-verse. Satokan reinterprets the UTAU characters with stylistic visual designs and gives them specific personalities: Defoko is jaded, being the default voice of UTAU and having Teto surpass her in popularity, and she often wields guns as a reference to her association with rocket launchers. Teto herself is a cocky character, and her chimera identity is represented through her being a sort of Frankenstein’s monster. All of the UTAUs have unique personalities, relationship dynamics, and stories like these. Satokan has even created two manga, available in both Japanese and English: “How to Make Adachi Rei” and “How to Make Kasane Teto,” which focus on these characters’ stories. Satokan’s social media accounts are full of art which I highly recommend browsing if you like their weird and fun art style.',
          'The three songs I shared during my presentation were “Watch for like 3 minutes,” “You gotta at least make it weird,” and “The Great Voice Synth Showdown.” All three songs feature Satokan’s unique art style and lyrical wordplay. The second song served as a great introduction to the UTAUs that Satokan uses, however “Watch for like 3 minutes” was the most significant one for me to share.',
          'What makes me love Satokan, and why I really wanted to share them, was because they really have a deep admiration for the Vocaloid music scene. They take inspiration from lots of producers, and often at the end of their music videos they have a list of credits for producers whose influences they used in the song. “Watch for like 3 minutes” is very emblematic of this love. It’s an ode, quite like “The Vocaloid Songs” by PinocchioP, to the Vocaloid scene as a whole and how it can have all kinds of different songs that are all united by the usage of vocal synthesizers, and how much these songs can mean to Vocaloid fans, or in Satokan’s case, UTAU fans. Fans of Avogado6 may find this zealous passion for vocal synths familiar.',
          'The UTAU scene is really at its peak right now, and Satokan is pretty representative of that, along with other UTAU producers like Akasaka Mmm, Ro2noki, Green wisteria, Picdo, Hasaki Tooru, Yukuewat, and many more. In my presentation, I included a whole slide for “adjacent” producers, producers whom I think Satokan enjoyers would also enjoy and vice versa. Other than the ones I just included, they were Avogado6 (as I briefly mentioned), DenkiQujira, Frog96, Idono Kawazu, and Dobuno Awa. Reflecting on this list, I would also include Abuseken now, as Satokan has also made darker and more personal songs. I hope that more and more people continue to discover the overall Vocaloid scene for what it is on the inside, this beautiful community that are more fans of each other than simply fans of the characters that represent us.'
        ]
      }
    ]
  }
];
