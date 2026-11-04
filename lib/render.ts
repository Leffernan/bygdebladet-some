import type { Post } from './types';
let fonts:Promise<void>|undefined;
function load(src:string) {return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Kunne ikke laste bildet. Kontroller bildeadressen.'));image.src=src;});}
export async function drawPost(canvas:HTMLCanvasElement,post:Post) {
 fonts ??= Promise.all([document.fonts.load('800 92px BarlowPost'),document.fonts.load('700 36px BarlowPost'),document.fonts.load('400 28px LatoPost'),document.fonts.load('700 22px LatoPost')]).then(()=>{});await fonts;
 const [image,logo]=await Promise.all([load('/api/image?url='+encodeURIComponent(post.imageUrl)),load('/assets/wm.png')]);
 const c=canvas.getContext('2d')!;if(!c)throw new Error('Nettleseren støtter ikke forhåndsvisning.');
 canvas.width=canvas.height=1080;c.fillStyle='#121214';c.fillRect(0,0,1080,1080);
 const scale=Math.max(1080/image.width,700/image.height),sw=1080/scale,sh=700/scale;
 c.drawImage(image,(image.width-sw)*post.cropX,(image.height-sh)*post.cropY,sw,sh,0,0,1080,700);
 const lh=logo.height*300/logo.width;c.fillStyle='#d81d1e';c.fillRect(724,28,328,lh+28);c.drawImage(logo,738,42,300,lh);c.textBaseline='alphabetic';
 const credit=post.ai?'Illustrasjon: KI':post.credit;
 if(credit){c.font='700 22px LatoPost';const width=c.measureText(credit).width;c.fillStyle='#000';c.beginPath();c.roundRect(1080-width-44,644,width+24,38,6);c.fill();c.fillStyle='#fff';c.fillText(credit,1080-width-32,672);}
 c.fillStyle='#d81d1e';c.fillRect(0,700,1080,8);if(post.category){c.font='700 36px BarlowPost';c.fillText(post.category.toUpperCase(),60,778);}
 const y0=post.category?788:750,room=1000-y0;let size=92,lines:string[]=[];
 function wrap(text:string){const result:string[]=[];let line='';for(const word of text.split(/\s+/)){const next=(line+' '+word).trim();if(c.measureText(next).width<=960)line=next;else{if(line)result.push(line);line=word;}}if(line)result.push(line);return result;}
 for(size=92;size>=40;size-=2){c.font=`800 ${size}px BarlowPost`;lines=wrap(post.title);if(lines.length*size*1.06<=room && lines.every(line=>c.measureText(line).width<=960))break;}
 if(size<40)throw new Error('Tittelen er for lang for malen. Kort den ned før godkjenning.');
 if(lines.length===2){const words=post.title.split(/\s+/);let best=Infinity;for(let i=1;i<words.length;i++){const a=words.slice(0,i).join(' '),b=words.slice(i).join(' '),max=Math.max(c.measureText(a).width,c.measureText(b).width),score=max-(/[:?]$/.test(a)?400:0);if(max<=960&&score<best){best=score;lines=[a,b];}}}
 c.fillStyle='#fff';lines.forEach((line,i)=>c.fillText(line,60,y0+size*.98+i*Math.floor(size*1.06)));c.fillStyle='#bebebe';c.font='400 28px LatoPost';c.fillText('Les heile saka på bygdebladet.com',60,1050);
}
