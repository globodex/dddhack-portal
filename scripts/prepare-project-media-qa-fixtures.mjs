// Generated synthetic images only; no uploaded user assets are copied.
import sharp from 'sharp';
import { mkdirSync,writeFileSync } from 'node:fs';
const dir='/tmp/ddd-media-fixtures';mkdirSync(dir,{recursive:true});
const image=async(name,w,h,type='png')=>{
 const pixels=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*4;pixels[at]=x<w/2?241:74;pixels[at+1]=y<h/2?104:151;pixels[at+2]=x<w/2?118:225;pixels[at+3]=(x>w*.3&&x<w*.7&&y>h*.3&&y<h*.7)?0:255;}
 const buffer=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).toFormat(type).toBuffer();writeFileSync(`${dir}/${name}.${type==='jpeg'?'jpg':'png'}`,buffer);return buffer;
};
const base=await image('square-alpha',192,192);await image('portrait',128,300);await image('ultrawide',3900,64);await image('portrait-jpeg',127,301,'jpeg');
writeFileSync(`${dir}/orientation6.jpg`,await sharp({create:{width:128,height:64,channels:3,background:'#dc7564'}}).jpeg().withMetadata({orientation:6}).toBuffer());await image('too-small',63,64);
function crc32(data){let crc=-1;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^-1)>>>0;}
function padPng(buffer,bytes){const len=bytes-buffer.length-12;const type=Buffer.from('tEXt');const content=Buffer.alloc(len,65);Buffer.from('SyntheticFixture\0').copy(content);const size=Buffer.alloc(4);size.writeUInt32BE(len);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,content])));return Buffer.concat([buffer.subarray(0,-12),size,type,content,crc,buffer.subarray(-12)]);}
for(const [kind,limit]of[['logo',1000000],['banner',5000000]])for(const extra of[0,1])writeFileSync(`${dir}/${kind}-${extra?'over':'exact'}.png`,padPng(base,limit+extra));
writeFileSync(`${dir}/spoof.gif`,Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
writeFileSync(`${dir}/truncated.png`,base.subarray(0,28));
const huge=Buffer.from(base);huge.writeUInt32BE(50000,16);huge.writeUInt32BE(crc32(huge.subarray(12,29)),29);writeFileSync(`${dir}/oversized-header.png`,huge);
console.log(dir);
