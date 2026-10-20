import fs from 'node:fs/promises';
import sharp from 'sharp';

// Original schematic, not a reference photograph or a product screenshot.
const options=[
 {key:'A',title:'DARK CHASSIS / WHITE ARCHIVE',bg:'#0a0c10',ink:'#ffffff',muted:'#aab9c1',face:'#e8eff2',faceInk:'#142027',edge:'#ffffff',signal:'#00f0ff',second:'#ffe600',bottom:'RECOMMENDED / USER PALETTE + ARCHIVE MASS'},
 {key:'B',title:'HIGH-KEY LABORATORY',bg:'#edf0f1',ink:'#142027',muted:'#52646e',face:'#fafcfc',faceInk:'#142027',edge:'#81939c',signal:'#00747c',second:'#a48226',bottom:'REFERENCE-FAITHFUL / CHANGES DARK BASE'},
 {key:'C',title:'CYAN TACTICAL PROJECTION',bg:'#07181d',ink:'#e8ffff',muted:'#7ca9b2',face:'#0d2c35',faceInk:'#c5fbff',edge:'#00f0ff',signal:'#00f0ff',second:'#ffe600',bottom:'REJECT AS DEFAULT / OUTLINE OVERLOAD'}
];
const poly='0,0 246,0 270,24 270,154 24,154 0,130';
let body='';
for(const [i,p]of options.entries()){
 const x=i*480;
 body+=`<g transform="translate(${x},0)"><rect width="480" height="590" fill="${p.bg}"/><text x="28" y="42" fill="${p.muted}" font-family="monospace" font-size="11">PROPOSED DIRECTION / ${p.key}</text><text x="28" y="80" fill="${p.ink}" font-family="Arial,sans-serif" font-size="23" font-weight="700">${p.title.split(' / ')[0]}</text><text x="28" y="105" fill="${p.ink}" font-family="Arial,sans-serif" font-size="19">${p.title.split(' / ')[1]||'MATERIAL STUDY'}</text>`;
 for(let line=0;line<7;line++)body+=`<path d="M 28 ${360+line*15} H 450" stroke="${p.signal}" stroke-opacity=".07"/>`;
 for(let line=0;line<7;line++)body+=`<path d="M 242 300 L ${-80+line*108} 465" stroke="${p.signal}" stroke-opacity=".08"/>`;
 body+=`<g transform="translate(78,193) skewY(-8)"><polygon points="${poly}" transform="translate(0,17)" fill="${i===1?'#b9c5cb':'#152b34'}" stroke="${p.edge}" stroke-opacity=".3"/><polygon points="${poly}" transform="translate(0,8)" fill="${i===1?'#dae2e6':'#203d47'}" stroke="${p.edge}" stroke-opacity=".55"/><polygon points="${poly}" fill="${p.face}" stroke="${p.edge}" stroke-width="1"/><path d="M 0 0 H 246 L 270 24 M 270 154 H 24 L 0 130" fill="none" stroke="${p.edge}" stroke-width="3"/><path d="M 16 34 H 254" stroke="${p.faceInk}" stroke-opacity=".25"/><text x="16" y="24" font-family="monospace" font-size="10" fill="${p.faceInk}">IVORG.ARC // 01</text><rect x="242" y="14" width="5" height="5" fill="${p.signal}"/><text x="18" y="78" font-family="Arial,sans-serif" font-weight="700" font-size="25" fill="${p.faceInk}">HOME</text><text x="18" y="102" font-family="monospace" font-size="9" fill="${p.faceInk}" opacity=".7">REAL PAGE PLANE</text><text x="18" y="120" font-family="monospace" font-size="9" fill="${p.faceInk}" opacity=".7">CONTENT NOT DEPICTED</text></g>`;
 body+=`<path d="M 348 285 H 406 L 438 317 V 372" fill="none" stroke="${p.signal}" stroke-width="1.5"/><path d="M 432 342 L 438 336 444 342 444 350 438 356 432 350 Z" fill="${p.bg}" stroke="${p.second}" stroke-width="1.5"/>`;
 body+=`<text x="28" y="482" fill="${p.muted}" font-family="monospace" font-size="10">PALETTE / MATERIAL + SIGNAL</text>`;
 for(const [j,color]of [p.bg,p.face,p.ink,p.signal,p.second].entries())body+=`<rect x="${28+j*86}" y="498" width="70" height="22" fill="${color}" stroke="${p.muted}" stroke-width=".5"/><text x="${28+j*86}" y="538" fill="${p.muted}" font-family="monospace" font-size="10">${color.toUpperCase()}</text>`;
 body+=`<text x="28" y="568" fill="${p.ink}" font-family="monospace" font-size="9">${p.bottom}</text></g>`;
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="632" viewBox="0 0 1440 632"><title>Three proposed material directions; schematic only, not implemented</title>${body}<rect y="590" width="1440" height="42" fill="#242b30"/><text x="28" y="616" fill="#ffffff" font-family="monospace" font-size="12">ORIGINAL DESIGN STUDY / NOT A REFERENCE IMAGE / NOT A RENDERED WORKBENCH / 2026-10-20</text></svg>`;
await fs.mkdir('docs/verification/rhine-research',{recursive:true});
await fs.writeFile('docs/verification/rhine-research/visual-directions.svg',svg);
await sharp(Buffer.from(svg)).png().toFile('docs/verification/rhine-research/visual-directions.png');
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255),lum=hex=>rgb(hex).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const pairs=[['white on dark','#ffffff','#0a0c10'],['secondary on dark','#aab9c1','#0a0c10'],['ink on white panel','#142027','#e8eff2'],['cyan on dark','#00f0ff','#0a0c10'],['cyan on white panel','#00f0ff','#e8eff2'],['white on cyan','#ffffff','#00f0ff'],['ink on yellow','#142027','#ffe600']].map(([label,foreground,background])=>({label,foreground,background,ratio:contrast(foreground,background),normalTextAA:contrast(foreground,background)>=4.5}));
await fs.writeFile('.companion/rhine-research/palette-contrast.json',JSON.stringify({type:'FLAT_OPAQUE_COLOR_CALCULATION_NOT_A_FULL_ACCESSIBILITY_AUDIT',pairs},null,2)+'\n');
console.log(JSON.stringify(pairs.map(p=>({label:p.label,ratio:p.ratio.toFixed(2),pass:p.normalTextAA})),null,2));
