'use strict';
const fs=require('node:fs');const path=require('node:path');const zlib=require('node:zlib');
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function chunk(type,data){const label=Buffer.from(type),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([label,data])));return Buffer.concat([size,label,data,checksum]);}
const size=256,raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const index=y*(size*4+1)+1+x*4;let color=[10,18,24,255];const edge=(x>=35&&x<=219&&(y===36||y===219))||(y>=36&&y<=219&&(x===35||x===219));if(edge)color=[113,158,166,255];if((x>=75&&x<=93&&y>=75&&y<=181)||(y>=75&&y<=181&&Math.abs(x-(115+(y-75)*.35))<9)||(y>=75&&y<=181&&Math.abs(x-(189-(y-75)*.35))<9))color=[234,230,223,255];if(x>=192&&x<=204&&y>=49&&y<=61)color=[200,168,107,255];for(let c=0;c<4;c++)raw[index+c]=color[c];}
const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
const dir=path.resolve(__dirname,'../src-tauri/icons');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'icon.png'),png);fs.writeFileSync(path.join(dir,'icon.ico'),Buffer.concat([ico,png]));
