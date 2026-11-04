export const defaultProfile={publicationName:'Bygdebladet',solutionName:'SoMe',brandColor:'#d81d1e',logoKey:'',logoFileName:'',logoType:'',logoUpdatedAt:null};
export function profileInput(input){
 const publicationName=String(input.publicationName||'').trim(),solutionName=String(input.solutionName||'').trim(),brandColor=String(input.brandColor||'');
 if(!publicationName||publicationName.length>80||!solutionName||solutionName.length>60)throw new Error('Oppgi avisnavn og navn på løsningen (maks. 80 og 60 tegn).');
 if(!/^#[0-9a-f]{6}$/i.test(brandColor))throw new Error('Profilfargen må være en fargekode som #d81d1e.');
 return {publicationName,solutionName,brandColor:brandColor.toLowerCase()};
}
export function userInput(input){
 const email=String(input.email||'').trim().toLowerCase(),displayName=String(input.displayName||'').trim();
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||!displayName||displayName.length>80)throw new Error('Oppgi et navn (maks. 80 tegn) og en gyldig e-postadresse.');
 return {email,displayName};
}
export function userChangeAllowed(current,next,actorId){
 if(!next.active&&(current.id===actorId||current.role==='owner'))throw new Error('Du kan ikke deaktivere deg selv eller eieren.');
 if(next.email!==current.email&&(current.auth_subject||current.role==='owner'))throw new Error('E-postadressen er koblet til innloggingen. Opprett en ny bruker for en annen e-postadresse.');
}
export function accountAllowsIdentity(row,subject,email){
 return !!row&&!!row.active&&!!subject&&(row.auth_subject?row.auth_subject===subject:row.email===String(email||'').trim().toLowerCase());
}
export function headerTextColor(hex){
 const rgb=hex.slice(1).match(/.{2}/g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#17202a':'#ffffff';
}
export function validateLogo(bytes,type){
 if(!bytes.length||bytes.length>5*1024*1024)throw new Error('Logoen må være mellom 1 byte og 5 MB.');
 const starts=(a)=>a.every((n,i)=>bytes[i]===n),text=new TextDecoder().decode(bytes);
 if(type==='image/png'&&starts([137,80,78,71,13,10,26,10]))return 'png';
 if(type==='image/jpeg'&&starts([255,216,255]))return 'jpg';
 if(type==='image/webp'&&text.slice(0,4)==='RIFF'&&text.slice(8,12)==='WEBP')return 'webp';
 if(type==='image/svg+xml'&&/<svg\b/i.test(text)&&!/<(?:script|foreignObject|iframe|object|embed|image|use|animate|set)\b|\son[a-z]+\s*=|(?:href|src)\s*=|url\s*\(|@import|<!ENTITY|<!DOCTYPE/i.test(text))return 'svg';
 throw new Error('Bruk PNG, JPG, WebP eller en ren SVG uten lenker eller aktivt innhold.');
}
