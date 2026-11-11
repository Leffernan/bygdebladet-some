import { loadMetaCredential } from './meta-credentials';
import { db, bucket, now, rawPost, postDeliveries, connection, settings, log, hash } from './server';
import { mayPublish } from './policy.mjs';
// A lost POST response requires a status check before another publish.
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
  if(!response.ok || data.error){ const code=Number(data.error?.code);const error=new Error(`Meta avviste forespørselen (${Number.isFinite(code)?'kode '+code:'HTTP '+response.status}). Kontroller tilgangen og innholdet.`); (error as any).definite=response.status>=400 && response.status<500 && code!==9007 && data.error?.is_transient!==true;throw error;}
  return data;
}
type DeliveryGuard = {state:string;revision:number;updated_at:string};
const instagramPreparing='Instagram klargjør bildet. Appen kontrollerer automatisk mens den er åpen. Bruk «Kontroller / publiser» hvis dette vedvarer.';

async function update(id:string, values:Record<string,unknown>, expected:DeliveryGuard) {
  const keys=Object.keys(values);
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(expected.updated_at)+1)).toISOString();
  const result=await db().prepare(`UPDATE deliveries SET ${[...keys.map(k=>k+'=?'),'updated_at=?'].join(',')} WHERE id=? AND state=? AND revision=? AND updated_at=?`)
    .bind(...Object.values(values),updatedAt,id,expected.state,expected.revision,expected.updated_at).run();
  return result.meta.changes ? updatedAt : null;
}
async function stageImage(p:any,pageId:string) {
  const media=await bucket().get(p.image_key);
  if(!media) throw new Error('Det godkjente bildet mangler.');
  const bytes=await media.arrayBuffer();
  if(await hash(bytes)!==p.image_hash) throw new Error('Bildet stemmer ikke med godkjenningen.');
  const stage=await graph(`${pageId}/photos`,'POST',{published:'false',caption:p.title},bytes);
  if(!stage.id) throw new Error('Meta returnerte ingen bilde-ID.');
  return stage.id;
}
async function done(p:any,d:any,guard:DeliveryGuard,id?:string,url?:string) {
  const committed=await update(d.id,{state:'published',remote_id:id||null,remote_url:url||null,error:null},guard);
  if(!committed)return null;
  const message=d.channel==='facebook'?'Publisert på Facebook':id?'Publisert på Instagram':'Instagram bekreftet publisering; direkte postlenke kunne ikke hentes.';
  await log('published',message,'Publisering',p.id);
  return committed;
}
export async function publishOne(id:string, options:{continuationOnly?:boolean}={}) {
  const p=await rawPost(id);p.channels=JSON.parse(p.channels);
  const ds=await postDeliveries(id),config=await connection();
  if(!config.publishingEnabled||(await settings()).paused)return ds;
  for(const d of ds){
    if(d.state==='published'||(options.continuationOnly&&d.state==='failed'))continue;
    if(!mayPublish(p,{...d,state:'ready'})||!config[d.channel as 'facebook'|'instagram']||(await settings()).paused)continue;

    const age=Date.now()-Date.parse(d.updated_at);
    const uncertain=d.state==='sending'||d.state==='unknown';
    if((d.state==='sending'&&age<120000)||(d.state==='processing'&&age<60000))continue;

    // The lease fences each durable checkpoint and is refreshed before the
    // final Meta POST. A superseded worker cannot send or overwrite a result.
    const claimAt=new Date(Math.max(Date.now(),Date.parse(d.updated_at)+1)).toISOString();
    const lock=await db().prepare(`UPDATE deliveries SET state='sending',updated_at=? WHERE id=? AND state=? AND revision=? AND updated_at=? AND EXISTS (SELECT 1 FROM posts WHERE id=? AND state='approved' AND approved_revision=revision AND revision=?)`)
      .bind(claimAt,d.id,d.state,p.revision,d.updated_at,p.id,p.revision).run();
    if(!lock.meta.changes)continue;
    const guard={state:'sending',revision:d.revision,updated_at:claimAt};
    const save=async(values:Record<string,unknown>)=>{
      const at=await update(d.id,values,guard);
      if(at)guard.updated_at=at;
      return !!at;
    };
    let publishing=false;
    let checkingInstagram=false;
    let container=d.container_id;
    try {
      if(d.channel==='facebook'&&uncertain){
        const photo=d.stage_id?await graph(d.stage_id,'GET',{fields:'page_story_id'}):null;
        if(photo?.page_story_id)await done(p,d,guard,photo.page_story_id,`https://www.facebook.com/${photo.page_story_id}`);
        else await save({state:'unknown',error:'Utfallet må kontrolleres hos Meta før ny publisering.'});
        continue;
      }

      // A lost response before the Instagram container ID is saved cannot
      // hide a publish. The final POST requires that ID and a current lease.
      let stageId=d.stage_id;
      if(!container&&!stageId){
        stageId=await stageImage(p,config.pageId);
        if(!await save({stage_id:stageId}))continue;
      }
      if(d.channel==='instagram'){
        if(!container){
          const photo=await graph(stageId,'GET',{fields:'images,source'});
          const source=photo.images?.sort((a:any,b:any)=>b.width-a.width)[0]?.source || photo.source;
          if(!source)throw new Error('Meta returnerte ingen tilgjengelig bildeadresse.');
          const created=await graph(`${config.instagramId}/media`,'POST',{image_url:source,caption:p.instagram_text,...(p.alt_text?{alt_text:p.alt_text}:{})});
          if(!created.id)throw new Error('Instagram returnerte ingen bildebeholder.');
          container=created.id;
          if(!await save({container_id:container}))continue;
        }

        checkingInstagram=true;
        const {status_code:status}=await graph(container,'GET',{fields:'status_code'});
        checkingInstagram=false;
        if(status==='PUBLISHED'){
          await done(p,d,guard,d.remote_id,d.remote_url);
          continue;
        }
        if(status==='ERROR'||status==='EXPIRED'){
          await save({state:'failed',container_id:null,error:status==='EXPIRED'?'Instagram-beholderen er utløpt. Bruk «Kontroller / publiser» for å klargjøre bildet på nytt.':'Instagram klarte ikke å klargjøre bildet. Bruk «Kontroller / publiser» for å prøve igjen.'});
          continue;
        }
        if(status==='IN_PROGRESS'||(status==='FINISHED'&&uncertain&&age<60000)){
          await save({state:'processing',error:instagramPreparing});
          continue;
        }
        if(status!=='FINISHED'){
          await save({state:'unknown',error:'Instagram ga ingen kjent status for bildet. Bruk «Kontroller / publiser» for å sjekke på nytt.'});
          continue;
        }
      }

      if((await settings()).paused||!(await connection()).publishingEnabled){
        await save({state:container?'processing':'ready'});
        continue;
      }
      if(!await save({error:null}))continue;
      publishing=true;
      if(d.channel==='facebook'){
        const result=await graph(`${config.pageId}/feed`,'POST',{message:p.facebook_text,attached_media:JSON.stringify([{media_fbid:stageId}])});
        if(!result.id)throw new Error('Facebook returnerte ingen innleggs-ID.');
        await done(p,d,guard,result.id,`https://www.facebook.com/${result.id}`);
      } else {
        const result=await graph(`${config.instagramId}/media_publish`,'POST',{creation_id:container});
        if(!result.id)throw new Error('Instagram returnerte ingen innleggs-ID.');
        const at=await done(p,d,guard,result.id);
        if(at)try{
          const media=await graph(result.id,'GET',{fields:'permalink'});
          if(media.permalink)await update(d.id,{remote_url:media.permalink},{...guard,state:'published',updated_at:at});
        }catch{}
      }
    } catch(e) {
      const message=e instanceof Error?e.message:'Ukjent publiseringsfeil';
      const unclear=checkingInstagram||(publishing&&!(e as any).definite)||(d.channel==='facebook'&&uncertain);
      const error=checkingInstagram?`Kunne ikke kontrollere bildet hos Instagram. ${message}`:message;
      if(await save({state:unclear?'unknown':'failed',error}))await log('error',`${d.channel}: ${error}`,'Publisering',p.id);
    }
  }
  const final=await postDeliveries(id);
  if(final.length && final.every(d=>d.state==='published')) await db().prepare("UPDATE posts SET state='published',updated_at=? WHERE id=? AND state='approved' AND approved_revision=revision AND revision=?").bind(now(),id,p.revision).run();
  return final;
}
export async function processApproved() {
  if(!(await connection()).publishingEnabled)return 0;
  const ids=await db().prepare("SELECT id FROM posts WHERE state='approved' AND approved_revision=revision ORDER BY updated_at LIMIT 5").all<{id:string}>();
  for(const p of ids.results){await publishOne(p.id);await db().prepare("UPDATE posts SET updated_at=? WHERE id=? AND state='approved'").bind(now(),p.id).run();}
  return ids.results.length;
}
