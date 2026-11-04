import { db, bucket, human, rawPost, postDeliveries, present, settings, connection, collect, sourceImage, log, now, hash, AppError } from '@/lib/server';
import { canApprove, editable, osloSlot } from '@/lib/policy.mjs';
import { imageUrl } from '@/lib/articles.mjs';
import { graph, publishOne, processApproved } from '@/lib/meta';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{path:string[]}>};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function body(req:Request):Promise<any> {if(Number(req.headers.get('content-length') || 0)>8000000)throw new AppError('Filen er for stor.');return req.json();}
async function dispatch(req:Request,ctx:Ctx):Promise<Response> {
 const path=(await ctx.params).path, action=path[0];
 if(req.method==='GET' && action==='data'){
  const [ps,ds,es,cfg,last]=await Promise.all([db().prepare('SELECT * FROM posts ORDER BY substr(created_at,1,16) DESC,rank ASC,created_at DESC LIMIT 300').all(),db().prepare('SELECT * FROM deliveries').all(),db().prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 50').all(),settings(),db().prepare("SELECT value FROM settings WHERE key='lastCollection'").first<{value:string}>()]);
  return json({posts:ps.results.map((p:any)=>present(p,ds.results.filter((d:any)=>d.post_id===p.id))),events:es.results,settings:cfg,connection:connection(),lastCollection:last?JSON.parse(last.value):null,user:req.headers.get('oai-authenticated-user-email') || null});
 }
 if(req.method==='GET' && action==='image'){
  const image=await sourceImage(new URL(req.url).searchParams.get('url') || '');
  return new Response(image.bytes,{headers:{'Content-Type':image.type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method==='GET' && action==='asset'){
  const p=await rawPost(path[1]),file=p.image_key?await bucket().get(p.image_key):null;
  if(!file)throw new AppError('Bildet finnes ikke.',404);
  return new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','Content-Disposition':`inline; filename=bygdebladet-${p.id}.jpg`}});
 }
 // Private Sites dispatch is the service authorization boundary. This endpoint can
 // only collect drafts and process existing, revision-bound human approvals.
 if(req.method==='POST' && action==='automation'){
  const cfg=await settings(); if(cfg.paused)return json({paused:true});
  const b=await body(req),slot=osloSlot(); let result:any={skipped:true};
  if(cfg.autoCollect && (slot || b.forceCollection===true)){
   const jobId=b.forceCollection===true?'manual:'+crypto.randomUUID():'collect:'+slot;
   const lock=await db().prepare("INSERT INTO jobs(id,state,started_at) VALUES(?,'running',?) ON CONFLICT(id) DO UPDATE SET state='running',started_at=excluded.started_at WHERE jobs.state='failed' OR (jobs.state='running' AND jobs.started_at<?)").bind(jobId,now(),new Date(Date.now()-15*60*1000).toISOString()).run();
   if(lock.meta.changes) try{
    result=await collect();await db().prepare('UPDATE jobs SET state=?,finished_at=?,result=? WHERE id=?').bind(result.errors.length?'failed':'done',now(),JSON.stringify(result),jobId).run();
   }catch(e){await db().prepare("UPDATE jobs SET state='failed',finished_at=?,result=? WHERE id=?").bind(now(),e instanceof Error?e.message:'Feil',jobId).run();await log('error',e instanceof Error?e.message:'Hentingen feilet.');throw e;}
  }
  const processed=await processApproved();return json({collection:result,approvedProcessed:processed});
 }
 const actor=human(req);
 if(req.method==='POST' && action==='collect'){
  const b=await body(req);return json(await collect(actor,b.url || undefined));
 }
 if(req.method==='POST' && action==='settings'){
  const b=await body(req),cfg=await settings();
  const next={paused:typeof b.paused==='boolean'?b.paused:cfg.paused,autoCollect:typeof b.autoCollect==='boolean'?b.autoCollect:cfg.autoCollect,topCount:Number.isInteger(b.topCount)?Math.max(1,Math.min(15,b.topCount)):cfg.topCount};
  await db().batch(Object.entries(next).map(([k,v])=>db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(v))));
  await log('settings',next.paused?'Automatisk kjøring er satt på pause.':'Innstillinger oppdatert.',actor);return json(next);
 }
 if(req.method==='POST' && action==='connection-test'){
  const cfg=connection();if(!cfg.facebook)throw new AppError('Meta-tilgangen er ikke konfigurert.');
  const page=await graph(cfg.pageId,'GET',{fields:'id,name,instagram_business_account'});
  if(cfg.instagramId && page.instagram_business_account?.id!==cfg.instagramId)throw new AppError('Instagram-kontoen er ikke koblet til den valgte Facebook-siden.');
  await log('connection',`Tilkobling kontrollert: ${page.name}`,actor);return json({pageName:page.name,instagramId:page.instagram_business_account?.id,publicationTested:false});
 }
 if(action==='posts' && path[1]){
  const id=path[1],sub=path[2],p=await rawPost(id),ds=await postDeliveries(id),b=await body(req);
  if(req.method==='PATCH'){
   if(p.revision!==b.revision)throw new AppError('Posten er endret i en annen fane. Last inn på nytt.',409);
   if(!editable(ds) || p.state==='published')throw new AppError('Publisering har startet. Posten er låst for å unngå doble innlegg.',409);
   const title=String(b.title ?? p.title).trim().slice(0,400), fb=String(b.facebookText ?? p.facebook_text).slice(0,10000),ig=String(b.instagramText ?? p.instagram_text).slice(0,4000);
   const channels=Array.isArray(b.channels)?[...new Set(b.channels.filter((c:unknown)=>c==='facebook'||c==='instagram'))]:JSON.parse(p.channels);
   if(!title)throw new AppError('Skriv en tittel.');
   const state=b.state==='rejected'?'rejected':'draft';
   const result=await db().batch([
    db().prepare(`UPDATE posts SET title=?,category=?,image_url=?,credit=?,ai=?,crop_x=?,crop_y=?,facebook_text=?,instagram_text=?,alt_text=?,channels=?,state=?,revision=revision+1,approved_revision=NULL,approved_at=NULL,approved_by=NULL,image_key=NULL,image_hash=NULL,updated_at=? WHERE id=? AND revision=? AND state!='published' AND NOT EXISTS(SELECT 1 FROM deliveries WHERE post_id=? AND state IN ('sending','unknown','published','processing'))`)
     .bind(title,String(b.category ?? p.category).slice(0,60),imageUrl(b.imageUrl ?? p.image_url),String(b.credit ?? p.credit).slice(0,180),Number(b.ai ?? !!p.ai),Math.max(0,Math.min(1,Number(b.cropX ?? p.crop_x))),Math.max(0,Math.min(1,Number(b.cropY ?? p.crop_y))),fb,ig,String(b.altText ?? p.alt_text).slice(0,1000),JSON.stringify(channels),state,now(),id,p.revision,id),
    db().prepare("DELETE FROM deliveries WHERE post_id=? AND state IN ('ready','failed') AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND approved_revision IS NULL)").bind(id,id,p.revision+1),
   ]);
   if(!result[0].meta.changes)throw new AppError('Posten ble endret eller publisering startet. Last inn på nytt.',409);
   await log(state==='rejected'?'rejected':'edited',state==='rejected'?'Posten ble avvist.':'Utkastet ble lagret. Tidligere godkjenning er opphevet.',actor,id);return json(present(await rawPost(id)));
  }
  if(req.method==='POST' && sub==='approve'){
   canApprove(present(p),b.revision,b.checks);
   if(typeof b.image!=='string' || !b.image.startsWith('data:image/jpeg;base64,'))throw new AppError('Forhåndsvisningen må være ferdig før godkjenning.');
   if(b.image.length>6000000)throw new AppError('Bildet er for stort.');
   const data=Uint8Array.from(atob(b.image.split(',')[1]),c=>c.charCodeAt(0));
   if(data[0]!==255 || data[1]!==216)throw new AppError('Ugyldig JPEG-bilde.');
   const digest=await hash(data),key=`approved/${id}/${p.revision}-${digest}.jpg`;await bucket().put(key,data,{httpMetadata:{contentType:'image/jpeg'}});
   const channels:string[]=JSON.parse(p.channels),date=now();
   const result=await db().batch([
    db().prepare("UPDATE posts SET state='approved',approved_revision=revision,approved_by=?,approved_at=?,image_key=?,image_hash=?,updated_at=? WHERE id=? AND revision=? AND state='draft'").bind(actor,date,key,digest,date,id,b.revision),
    ...channels.map(c=>db().prepare(`INSERT INTO deliveries(id,post_id,channel,revision,state,updated_at) SELECT ?,?,?,?,'ready',? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND state='approved' AND approved_revision=?) ON CONFLICT(id) DO NOTHING`).bind(id+':'+c,id,c,b.revision,date,id,b.revision)),
   ]);
   if(!result[0].meta.changes)throw new AppError('Posten er endret. Kontroller den nyeste versjonen.',409);
   await log('approved',`Versjon ${b.revision} godkjent for ${channels.join(' og ')}.`,actor,id);
   if(b.publishNow && !(await settings()).paused)await publishOne(id);
   return json({approved:true,deliveries:await postDeliveries(id)});
  }
  if(req.method==='POST' && sub==='publish'){
   if((await settings()).paused)throw new AppError('Publisering er satt på pause.');
   if(p.state!=='approved' || p.approved_revision!==p.revision)throw new AppError('Posten må godkjennes før publisering.',409);
   const cfg=connection();if(JSON.parse(p.channels).some((c:'facebook'|'instagram')=>!cfg[c]))throw new AppError('Koble til de valgte Meta-kontoene først.');
   return json({deliveries:await publishOne(id)});
  }
 }
 throw new AppError('Fant ikke handlingen.',404);
}
async function safe(req:Request,ctx:Ctx){try{return await dispatch(req,ctx);}catch(e){const message=e instanceof Error?e.message:'Noe gikk galt.';return json({error:message},e instanceof AppError?e.status:400);}}
export const GET=safe;export const POST=safe;export const PATCH=safe;
