import { loadMetaCredential } from './meta-credentials';
import { db, bucket, now, rawPost, postDeliveries, connection, settings, log, hash } from './server';
import { mayPublish } from './policy.mjs';
// POST failures never get automatic retries: a network timeout can hide success.
export async function graph(path:string, method='GET', params:Record<string,string>={}, file?:ArrayBuffer):Promise<any> {
  const credentials=await loadMetaCredential();
  if(!credentials.token || !/^v\d+\.\d+$/.test(credentials.apiVersion)) throw new Error('Meta er ikke koblet til.');
  if(method!=='GET'&&!credentials.publishingEnabled)throw Object.assign(new Error('Publisering er ikke aktivert.'),{definite:true});
  const url=new URL(`https://graph.facebook.com/${credentials.apiVersion}/${path}`);
  let body:FormData|undefined;
  if(method==='GET') for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  else { body=new FormData();for(const [k,v] of Object.entries(params)) body.append(k,v);if(file)body.append('source',new Blob([file],{type:'image/jpeg'}),'bygdebladet.jpg'); }
  const response=await fetch(url,{method,body,headers:{Authorization:`Bearer ${credentials.token}`},signal:AbortSignal.timeout(25000),redirect:'manual'});
  const data:any=await response.json();
  if(!response.ok || data.error){ const code=Number(data.error?.code);const error=new Error(`Meta avviste forespørselen (${Number.isFinite(code)?'kode '+code:'HTTP '+response.status}). Kontroller tilgangen og innholdet.`); (error as any).definite=response.status>=400 && response.status<500;throw error;}
  return data;
}
async function update(id:string, values:Record<string,unknown>, expected?:Record<string,unknown>) {
  const keys=Object.keys(values),guards=Object.keys(expected||{});
  return db().prepare(`UPDATE deliveries SET ${[...keys.map(k=>k+'=?'),'updated_at=?'].join(',')} WHERE id=?${guards.map(k=>' AND '+k+' IS ?').join('')}`).bind(...Object.values(values),now(),id,...Object.values(expected||{})).run();
}
async function ensureStage(p:any,d:any) {
  if(d.stage_id) return d.stage_id;
  const media=await bucket().get(p.image_key); if(!media) throw new Error('Det godkjente bildet mangler.');
  const bytes=await media.arrayBuffer(); if(await hash(bytes)!==p.image_hash) throw new Error('Bildet stemmer ikke med godkjenningen.');
  const stage=await graph(`${(await connection()).pageId}/photos`,'POST',{published:'false',caption:p.title},bytes);
  if(!stage.id) throw new Error('Meta returnerte ingen bilde-ID.');
  await update(d.id,{stage_id:stage.id}); d.stage_id=stage.id; return stage.id;
}
async function done(p:any,d:any,id:string,url?:string) {
  await update(d.id,{state:'published',remote_id:id,remote_url:url || null,error:null});
  await log('published',`Publisert på ${d.channel==='facebook'?'Facebook':'Instagram'}`, 'Publisering',p.id);
}
export async function reconcile(p:any,d:any) {
  if(d.channel==='facebook' && d.stage_id){
    const photo=await graph(d.stage_id,'GET',{fields:'page_story_id'});
    if(photo.page_story_id){await done(p,d,photo.page_story_id,`https://www.facebook.com/${photo.page_story_id}`);return true;}
  }
  if(d.channel==='instagram' && d.container_id){
    const status=await graph(d.container_id,'GET',{fields:'status_code'});
    if(status.status_code==='PUBLISHED'){
      // Container ID is not the published media ID. Mark outcome confirmed; don't fabricate a permalink.
      await update(d.id,{state:'published',error:null});await log('published','Instagram bekreftet publisering; direkte postlenke kunne ikke hentes.','Publisering',p.id);return true;
    }
    if(['ERROR','EXPIRED'].includes(status.status_code)) await update(d.id,{state:'failed',container_id:null,error:'Instagram-beholderen feilet eller utløp. Kan prøves igjen.'});
  }
  return false;
}
export async function publishOne(id:string, options:{continuationOnly?:boolean}={}) {
  const p=await rawPost(id);p.channels=JSON.parse(p.channels);
  const ds=await postDeliveries(id),config=await connection();
  if(!config.publishingEnabled||(await settings()).paused)return ds;
  for(const d of ds){
    if(d.state==='published'||(options.continuationOnly&&d.state==='failed'))continue;
    if(['sending','unknown'].includes(d.state)){
      if(d.state==='sending' && Date.now()-Date.parse(d.updated_at)<120000)continue;
      const claimed=await update(d.id,{state:'unknown',error:'Utfallet må kontrolleres hos Meta før ny publisering.'},{state:d.state,updated_at:d.updated_at,revision:d.revision});
      if(!claimed.meta.changes)continue;
      try{await reconcile(p,d);}catch{} continue;
    }
    let resume=false;
    if(d.state==='processing'){
      if(Date.now()-Date.parse(d.updated_at)<60000)continue;
      // Only one tab or scheduled run may check and resume this snapshot.
      const expected={state:'processing',revision:d.revision,container_id:d.container_id};
      const claimed=await update(d.id,{}, {...expected,updated_at:d.updated_at});
      if(!claimed.meta.changes)continue;
      try {
        const status=await graph(d.container_id,'GET',{fields:'status_code'});
        if(status.status_code==='FINISHED')resume=true;
        else if(status.status_code==='PUBLISHED') await reconcile(p,d);
        else if(['ERROR','EXPIRED'].includes(status.status_code)) await update(d.id,{state:'failed',container_id:null,error:'Instagram-beholderen feilet. Prøv igjen.'},expected);
        else await update(d.id,{error:'Instagram har ennå ikke bekreftet at bildet er klart. Bruk «Kontroller / publiser» hvis dette vedvarer.'},expected);
      }catch(e){await update(d.id,{error:e instanceof Error?e.message:'Kunne ikke kontrollere Instagram.'},expected);}
      if(!resume)continue;
    }
    if(!mayPublish(p,resume?{...d,state:'ready'}:d) || !config[d.channel as 'facebook'|'instagram'] || (await settings()).paused) continue;
    // Claim processing directly; resetting it to ready could overwrite a result
    // from a concurrent publisher and allow the same post to be sent twice.
    const lock=await db().prepare(`UPDATE deliveries SET state='sending',updated_at=? WHERE id=? AND state=? AND revision=? AND container_id IS ? AND EXISTS (SELECT 1 FROM posts WHERE id=? AND state='approved' AND approved_revision=revision)`).bind(now(),d.id,d.state,p.revision,d.container_id||null,p.id).run();
    if(!lock.meta.changes)continue;
    let publishing=false;
    try {
      const stageId=await ensureStage(p,d);
      if(d.channel==='facebook'){
        publishing=true;
        const result=await graph(`${config.pageId}/feed`,'POST',{message:p.facebook_text,attached_media:JSON.stringify([{media_fbid:stageId}])});
        await done(p,d,result.id,`https://www.facebook.com/${result.id}`);
      } else {
        let container=d.container_id;
        if(!container){
          const photo=await graph(stageId,'GET',{fields:'images,source'});
          const source=photo.images?.sort((a:any,b:any)=>b.width-a.width)[0]?.source || photo.source;
          if(!source)throw new Error('Meta returnerte ingen tilgjengelig bildeadresse.');
          const created=await graph(`${config.instagramId}/media`,'POST',{image_url:source,caption:p.instagram_text,...(p.alt_text?{alt_text:p.alt_text}:{})});
          container=created.id;await update(d.id,{container_id:container}); d.container_id=container;
        }
        const status=resume?{status_code:'FINISHED'}:await graph(container,'GET',{fields:'status_code'});
        if(status.status_code==='PUBLISHED'){await reconcile(p,d);continue;}
        if(status.status_code!=='FINISHED') {await update(d.id,{state:'processing',error:'Instagram klargjør bildet. Appen kontrollerer automatisk mens den er åpen.'});continue;}
        publishing=true;
        const result=await graph(`${config.instagramId}/media_publish`,'POST',{creation_id:container});
        await done(p,d,result.id);
        try{const media=await graph(result.id,'GET',{fields:'permalink'});await update(d.id,{remote_url:media.permalink || null});}catch{}
      }
    } catch(e) {
      const message=e instanceof Error?e.message:'Ukjent publiseringsfeil';
      await update(d.id,{state:publishing && !(e as any).definite?'unknown':'failed',error:message});
      await log('error',`${d.channel}: ${message}`,'Publisering',p.id);
    }
  }
  const final=await postDeliveries(id);
  if(final.length && final.every(d=>d.state==='published')) await db().prepare("UPDATE posts SET state='published',updated_at=? WHERE id=? AND state='approved'").bind(now(),id).run();
  return final;
}
export async function processApproved() {
  if(!(await connection()).publishingEnabled)return 0;
  const ids=await db().prepare("SELECT id FROM posts WHERE state='approved' AND approved_revision=revision ORDER BY updated_at LIMIT 5").all<{id:string}>();
  for(const p of ids.results){await publishOne(p.id);await db().prepare("UPDATE posts SET updated_at=? WHERE id=? AND state='approved'").bind(now(),p.id).run();}
  return ids.results.length;
}
