import { env } from 'cloudflare:workers';
import { articleUrl, frontpage, parseArticle, ORIGIN, imageUrl } from './articles.mjs';
import type { Post, Settings } from './types';
import { metaConnectionStatus } from './meta-credentials';
import { defaultProfile } from './profile-policy.mjs';
import { fetchSource } from './source-fetch.mjs';
export const now = () => new Date().toISOString();
export function db() { if(!env.DB) throw new Error('Databasen er ikke koblet til.'); return env.DB; }
export function bucket() { if(!env.BUCKET) throw new Error('Bildelagringen er ikke koblet til.'); return env.BUCKET; }
export class AppError extends Error { constructor(message:string, public status=400){super(message);} }
export function human(req:Request) {
  const id=req.headers.get('oai-authenticated-user-id');
  if(!id) throw new AppError('Logg inn med ChatGPT for å gjøre endringer.',401);
  if(req.headers.get('sec-fetch-site')==='cross-site') throw new AppError('Åpne siden og prøv igjen.',403);
  return req.headers.get('oai-authenticated-user-email') || id;
}
export async function hash(bytes:ArrayBuffer | Uint8Array | string) {
  const input=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
  const digest=await crypto.subtle.digest('SHA-256',input as BufferSource);
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function log(kind:string,message:string,actor='System',postId:string|null=null) {
  await db().prepare('INSERT INTO events (id,post_id,kind,message,actor,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),postId,kind,message,actor,now()).run();
}
export async function settings():Promise<Settings> {
  const rows=await db().prepare('SELECT key,value FROM settings').all<{key:string,value:string}>();
  const data=Object.fromEntries(rows.results.map(r=>[r.key,JSON.parse(r.value)]));
  return {paused:false,topCount:5,autoCollect:true,...defaultProfile,...data};
}
export function present(r:any, deliveries:any[]=[]):Post {
  return {id:r.id,url:r.url,title:r.title,intro:r.intro,category:r.category,imageUrl:r.image_url,credit:r.credit,ai:!!r.ai,emphasized:!!r.emphasized,cropX:r.crop_x,cropY:r.crop_y,
    facebookText:r.facebook_text,instagramText:r.instagram_text,altText:r.alt_text,channels:JSON.parse(r.channels),warnings:JSON.parse(r.warnings),rank:r.rank,
    state:r.state,revision:r.revision,approvedAt:r.approved_at,approvedBy:r.approved_by,approvedByUserId:r.approved_by_user_id,createdAt:r.created_at,updatedAt:r.updated_at,deliveries};
}
export async function rawPost(id:string):Promise<any> { const row=await db().prepare('SELECT * FROM posts WHERE id=?').bind(id).first(); if(!row) throw new AppError('Posten finnes ikke.',404); return row; }
export async function postDeliveries(id:string):Promise<any[]> { return (await db().prepare('SELECT * FROM deliveries WHERE post_id=?').bind(id).all()).results; }
export async function sourceFetch(url:string):Promise<Response> {
  return (await fetchSource(url))!;
}
export async function insertArticle(url:string, rank=0,actor='System', batchAt=now()) {
  const target=articleUrl(url);
  if(await db().prepare('SELECT id FROM posts WHERE id=?').bind(target.id).first()) return false;
  const html=await (await sourceFetch(target.url)).text();
  if(html.length>3000000) throw new Error('Sakssiden var uventet stor.');
  const p=parseArticle(html,target.url); const date=batchAt;
  const result=await db().prepare(`INSERT OR IGNORE INTO posts (id,url,title,intro,category,image_url,credit,ai,crop_x,crop_y,facebook_text,instagram_text,alt_text,channels,warnings,rank,state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'draft',1,?,?)`)
    .bind(p.id,p.url,p.title,p.intro,p.category,p.imageUrl,p.credit,Number(p.ai),p.cropX,p.cropY,p.facebookText,p.instagramText,p.altText,JSON.stringify(p.channels),JSON.stringify(p.warnings),rank,date,date).run();
  if(result.meta.changes) await log('import',`Hentet «${p.title}»`,actor,p.id);
  return !!result.meta.changes;
}
export async function collect(actor='System', single?:string) {
  const config=await settings();
  const candidates=single ? [{...articleUrl(single),rank:0}] : frontpage(await(await sourceFetch(ORIGIN+'/')).text(),config.topCount);
  const result={added:0,existing:0,errors:[] as string[]},batchAt=now();
  // Bounded batches keep subrequests and runtime predictable.
  for(let i=0;i<candidates.length;i+=3) await Promise.all(candidates.slice(i,i+3).map(async p=>{
    try { if(await insertArticle(p.url,p.rank,actor,batchAt)) result.added++; else result.existing++; }
    catch(e){result.errors.push(`${p.url}: ${e instanceof Error?e.message:'Ukjent feil'}`);}
  }));
  await log('collection',`${result.added} nye utkast, ${result.existing} finnes allerede${result.errors.length ? `, ${result.errors.length} feil` : ''}.`,actor);
  await db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('lastCollection',JSON.stringify({at:now(),...result})).run();
  return result;
}
export async function sourceImage(url:string) {
  const safe=imageUrl(url), key='sources/'+await hash(safe);
  let cached;try{cached=await bucket().get(key);}catch(e){throw new Error('Kunne ikke lese bildelageret: '+(e instanceof Error?e.message:'ukjent feil'));}
  if(cached) return {bytes:await cached.arrayBuffer(),type:cached.httpMetadata?.contentType || 'image/jpeg'};
  let res:Response;try{res=await sourceFetch(safe);}catch(e){throw new Error('Kunne ikke hente kildebildet: '+(e instanceof Error?e.message:'ukjent feil'));} const type=res.headers.get('content-type')?.split(';')[0] || '';
  if(!['image/jpeg','image/png','image/webp'].includes(type)) throw new AppError('Bildet har et format som ikke støttes.');
  if(Number(res.headers.get('content-length') || 0)>12000000) throw new AppError('Bildet er for stort.');
  const bytes=await res.arrayBuffer(); if(bytes.byteLength>12000000) throw new AppError('Bildet er for stort.');
  await bucket().put(key,bytes,{httpMetadata:{contentType:type}}); return {bytes,type};
}
export const connection=metaConnectionStatus;
