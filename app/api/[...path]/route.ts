import { waitUntil } from 'cloudflare:workers';
import { db, bucket, human, rawPost, postDeliveries, present, settings, connection, collect, sourceImage, log, now, hash, AppError } from '@/lib/server';
import { canApprove, editable, osloSlot } from '@/lib/policy.mjs';
import { imageUrl } from '@/lib/articles.mjs';
import { formatCaptions } from '@/lib/captions.mjs';
import { publishOne, processApproved } from '@/lib/meta';
import { loadMetaCredential, saveMetaCredential, setMetaPublishingEnabled, verifyMetaCredential } from '@/lib/meta-credentials';
import { resolveUser, listUsers, saveUser } from '@/lib/users';
import { profileInput, validateLogo } from '@/lib/profile-policy.mjs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{path:string[]}>};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function keepRunning<T>(job:Promise<T>) {
 waitUntil(job.catch(()=>{}));
 return job;
}
async function body(req:Request):Promise<any> {if(Number(req.headers.get('content-length') || 0)>8000000)throw new AppError('Filen er for stor.');return req.json();}
async function dispatch(req:Request,ctx:Ctx):Promise<Response> {
 const path=(await ctx.params).path, action=path[0];
 const viewer=req.headers.get('oai-authenticated-user-id')?await resolveUser(req):null;
 if(req.method==='GET' && action==='data'){
  const [ps,ds,es,cfg,last]=await Promise.all([db().prepare('SELECT * FROM posts ORDER BY substr(created_at,1,16) DESC,rank ASC,created_at DESC LIMIT 300').all(),db().prepare('SELECT * FROM deliveries').all(),db().prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 50').all(),settings(),db().prepare("SELECT value FROM settings WHERE key='lastCollection'").first<{value:string}>()]);
  return json({posts:ps.results.map((p:any)=>present(p,ds.results.filter((d:any)=>d.post_id===p.id))),events:es.results,settings:cfg,connection:await connection(),lastCollection:last?JSON.parse(last.value):null,user:viewer?.email||null,currentUser:viewer,users:await listUsers()});
 }
 if(req.method==='GET' && action==='logo'){
  const cfg=await settings();if(!cfg.logoKey)return Response.redirect(new URL('/hub-logo.svg',req.url),307);
  const file=await bucket().get(cfg.logoKey);if(!file)return Response.redirect(new URL('/hub-logo.svg',req.url),307);
  return new Response(file.body,{headers:{'Content-Type':cfg.logoType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
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
  // A maintenance read can collect drafts without touching the publishing queue.
  const processed=b.collectionOnly===true?0:await keepRunning(processApproved());return json({collection:result,approvedProcessed:processed});
 }
 human(req);const member=viewer||await resolveUser(req),actor=member.displayName;
 if(req.method==='POST'&&(action==='profile'||action==='users'||action==='logo')){
  if(req.headers.get('origin')!==new URL(req.url).origin)throw new AppError('Åpne appen direkte og prøv igjen.',403);
 }
 if(req.method==='POST'&&action==='users'){
  const b=await body(req),user=await saveUser(b,member,path[1]);
  await log('user',`${path[1]?'Oppdatert':'Opprettet'} bruker: ${user.displayName} (${user.email}) · ${user.active?'aktiv':'deaktivert'}.`,actor);
  return json({user});
 }
 if(req.method==='POST'&&action==='profile'){
  const values=profileInput(await body(req));
  await db().batch(Object.entries(values).map(([k,v])=>db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(v))));
  await log('settings','Oppdatert navn og profilfarge for løsningen.',actor);return json(await settings());
 }
 if(req.method==='POST'&&action==='logo'){
  const cfg=await settings();let values;
  if(path[1]==='reset')values={logoKey:'',logoType:'',logoFileName:'',logoUpdatedAt:now()};
  else {
   if(Number(req.headers.get('content-length')||0)>5300000)throw new AppError('Logoen kan ikke være større enn 5 MB.');
   const form=await req.formData(),file=form.get('file');if(!(file instanceof File))throw new AppError('Velg en logofil.');
   if(file.size>5*1024*1024)throw new AppError('Logoen kan ikke være større enn 5 MB.');
   const bytes=new Uint8Array(await file.arrayBuffer()),extension=validateLogo(bytes,file.type),key=`profile/logo/${crypto.randomUUID()}.${extension}`;
   await bucket().put(key,bytes,{httpMetadata:{contentType:file.type}});
   values={logoKey:key,logoType:file.type,logoFileName:file.name.slice(0,200),logoUpdatedAt:now()};
  }
  await db().batch(Object.entries(values).map(([k,v])=>db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(v))));
  if(cfg.logoKey)await bucket().delete(cfg.logoKey).catch(()=>{});
  await log('settings',path[1]==='reset'?'Tilbakestilte logoen til standardlogo.':'Oppdaterte logoen i løsningen.',actor);return json(await settings());
 }
 if(req.method==='POST' && action==='connection'){
  const origin=req.headers.get('origin'),site=req.headers.get('sec-fetch-site');
  if(origin!==new URL(req.url).origin||(site&&site!=='same-origin'))throw new AppError('Åpne appen direkte og prøv igjen.',403);
  if(Number(req.headers.get('content-length')||0)>20000)throw new AppError('Tilkoblingsdataene er for store.');
  const b=await body(req);
  if(path[1]==='publishing'){
   if(typeof b.enabled!=='boolean')throw new AppError('Velg om publisering skal være aktiv.');
   const status=await setMetaPublishingEnabled(b.enabled,actor);
   await log('connection',b.enabled?'Publisering til Meta er aktivert. Bare menneskelig godkjente poster kan publiseres.':'Publisering til Meta er deaktivert.',actor);
   return json(status);
  }
  if(path.length!==1)throw new AppError('Fant ikke handlingen.',404);
  const status=await saveMetaCredential(b,actor);
  await log('connection','Meta-tilkoblingen er kontrollert og lagret. Publisering er deaktivert.',actor);
  return json(status);
 }
 if(req.method==='POST' && (action==='collect'||(action==='news'&&path[1]==='import'&&path.length===2))){
  const b=await body(req);return json(await collect(actor,b.url || undefined));
 }
 if(req.method==='POST' && action==='settings'){
  const b=await body(req),cfg=await settings();
  const next={paused:typeof b.paused==='boolean'?b.paused:cfg.paused,autoCollect:typeof b.autoCollect==='boolean'?b.autoCollect:cfg.autoCollect,topCount:Number.isInteger(b.topCount)?Math.max(1,Math.min(15,b.topCount)):cfg.topCount};
  await db().batch(Object.entries(next).map(([k,v])=>db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(v))));
  await log('settings',next.paused?'Automatisk kjøring er satt på pause.':'Innstillinger oppdatert.',actor);return json(next);
 }
 if(req.method==='POST' && action==='connection-test'){
  const cfg=await connection();if(!cfg.facebook)throw new AppError('Meta-tilgangen er ikke konfigurert eller har utløpt.');
  const names=await verifyMetaCredential(await loadMetaCredential());
  await log('connection',`Tilkobling kontrollert: ${names.pageName}`,actor);return json({...names,publicationTested:false});
 }
 if(action==='posts' && path[1]){
  const id=path[1],sub=path[2],p=await rawPost(id),ds=await postDeliveries(id),b=await body(req);
  if(req.method==='PATCH'){
   if(p.revision!==b.revision)throw new AppError('Posten er endret i en annen fane. Last inn på nytt.',409);
   if(!editable(ds) || p.state==='published')throw new AppError('Publisering har startet. Posten er låst for å unngå doble innlegg.',409);
   const title=String(b.title ?? p.title).trim().slice(0,400);
   let fb=b.facebookText==null||b.facebookText===p.facebook_text?p.facebook_text:String(b.facebookText).slice(0,10000);
   let ig=b.instagramText==null||b.instagramText===p.instagram_text?p.instagram_text:String(b.instagramText).slice(0,4000);
   if(b.sharedCaption!==undefined){
    const caption=b.sharedCaption;
    if(typeof caption?.text!=='string'||typeof caption?.tags!=='string')throw new AppError('Postteksten er ugyldig.');
    const formatted=formatCaptions(caption.text,p.url,caption.tags);
    if(formatted.facebookText.length>10000||formatted.instagramText.length>10000)throw new AppError('Postteksten er for lang.');
    fb=formatted.facebookText;
    ig=formatted.instagramText;
   }
   const channels=Array.isArray(b.channels)?[...new Set(b.channels.filter((c:unknown)=>c==='facebook'||c==='instagram'))]:JSON.parse(p.channels);
   if(!title)throw new AppError('Skriv en tittel.');
   if(b.emphasized!==undefined&&typeof b.emphasized!=='boolean')throw new AppError('Velg om saken skal fremheves.');
   const emphasized=b.emphasized??!!p.emphasized;
   const state=b.state==='rejected'?'rejected':'draft';
   const result=await db().batch([
    db().prepare(`UPDATE posts SET title=?,category=?,image_url=?,credit=?,ai=?,emphasized=?,crop_x=?,crop_y=?,facebook_text=?,instagram_text=?,alt_text=?,channels=?,state=?,revision=revision+1,approved_revision=NULL,approved_at=NULL,approved_by=NULL,approved_by_user_id=NULL,image_key=NULL,image_hash=NULL,updated_at=? WHERE id=? AND revision=? AND state!='published' AND NOT EXISTS(SELECT 1 FROM deliveries WHERE post_id=? AND state IN ('sending','unknown','published','processing'))`)
     .bind(title,String(b.category ?? p.category).slice(0,60),imageUrl(b.imageUrl ?? p.image_url),String(b.credit ?? p.credit).slice(0,180),Number(b.ai ?? !!p.ai),Number(emphasized),Math.max(0,Math.min(1,Number(b.cropX ?? p.crop_x))),Math.max(0,Math.min(1,Number(b.cropY ?? p.crop_y))),fb,ig,String(b.altText ?? p.alt_text).slice(0,1000),JSON.stringify(channels),state,now(),id,p.revision,id),
    db().prepare("DELETE FROM deliveries WHERE post_id=? AND state IN ('ready','failed') AND EXISTS(SELECT 1 FROM posts WHERE id=? AND revision=? AND approved_revision IS NULL)").bind(id,id,p.revision+1),
   ]);
   if(!result[0].meta.changes)throw new AppError('Posten ble endret eller publisering startet. Last inn på nytt.',409);
   await log(state==='rejected'?'rejected':'edited',state==='rejected'?'Posten ble avvist.':'Utkastet ble lagret. Tidligere godkjenning er opphevet.',actor,id);return json(present(await rawPost(id)));
  }
  if(req.method==='POST' && sub==='approve'){
   canApprove(present(p),b.revision,b.contentConfirmed===undefined?b.checks:b.contentConfirmed===true);
   if((b.emphasized??false)!==!!p.emphasized)throw new AppError('Bildemalen er endret. Last inn posten på nytt før du godkjenner.',409);
   if(typeof b.image!=='string' || !b.image.startsWith('data:image/jpeg;base64,'))throw new AppError('Forhåndsvisningen må være ferdig før godkjenning.');
   if(b.image.length>6000000)throw new AppError('Bildet er for stort.');
   const data=Uint8Array.from(atob(b.image.split(',')[1]),c=>c.charCodeAt(0));
   if(data[0]!==255 || data[1]!==216)throw new AppError('Ugyldig JPEG-bilde.');
   const digest=await hash(data),key=`approved/${id}/${p.revision}-${digest}.jpg`;await bucket().put(key,data,{httpMetadata:{contentType:'image/jpeg'}});
   const channels:string[]=JSON.parse(p.channels),date=now();
   const result=await db().batch([
    db().prepare("UPDATE posts SET state='approved',approved_revision=revision,approved_by=?,approved_by_user_id=?,approved_at=?,image_key=?,image_hash=?,updated_at=? WHERE id=? AND revision=? AND state='draft'").bind(actor,member.id,date,key,digest,date,id,b.revision),
    ...channels.map(c=>db().prepare(`INSERT INTO deliveries(id,post_id,channel,revision,state,updated_at) SELECT ?,?,?,?,'ready',? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND state='approved' AND approved_revision=?) ON CONFLICT(id) DO NOTHING`).bind(id+':'+c,id,c,b.revision,date,id,b.revision)),
   ]);
   if(!result[0].meta.changes)throw new AppError('Posten er endret. Kontroller den nyeste versjonen.',409);
   await log('approved',`Versjon ${b.revision} godkjent for ${channels.join(' og ')}.`,actor,id);
   if(b.publishNow && !(await settings()).paused){
    waitUntil(publishOne(id).catch(()=>log('error','Publiseringsjobben ble avbrutt. Bruk «Kontroller / publiser» for å fortsette.','Publisering',id)));
   }
   return json({approved:true,deliveries:await postDeliveries(id)});
  }
  if(req.method==='POST' && sub==='publish'){
   if((await settings()).paused)throw new AppError('Publisering er satt på pause.');
   if(p.state!=='approved' || p.approved_revision!==p.revision)throw new AppError('Posten må godkjennes før publisering.',409);
   const cfg=await connection();if(!cfg.publishingEnabled)throw new AppError('Aktiver publisering under Innstillinger først.');if(JSON.parse(p.channels).some((c:'facebook'|'instagram')=>!cfg[c]))throw new AppError('Koble til de valgte Meta-kontoene først.');
   return json({deliveries:await keepRunning(publishOne(id,{continuationOnly:b.continuationOnly===true}))});
  }
 }
 throw new AppError('Fant ikke handlingen.',404);
}
async function safe(req:Request,ctx:Ctx){try{return await dispatch(req,ctx);}catch(e){const message=e instanceof Error?e.message:'Noe gikk galt.';return json({error:message},e instanceof Error&&[401,403,404,409].includes((e as any).status)?(e as any).status:400);}}
export const GET=safe;export const POST=safe;export const PATCH=safe;
