import { env } from 'cloudflare:workers';
import { openCredential, sealCredential } from './credential-crypto.mjs';
import { publicConnection, verifyMetaCredential } from './meta-connection.mjs';
export { verifyMetaCredential } from './meta-connection.mjs';

export type MetaCredential = {token:string;pageId:string;instagramId:string;apiVersion:string;pageName:string;instagramUsername:string;expiresAt:string|null;publishingEnabled:boolean;stored:boolean};
function database(){if(!env.DB)throw new Error('Databasen er ikke tilgjengelig.');return env.DB;}
export async function loadMetaCredential():Promise<MetaCredential>{
 const row=await database().prepare("SELECT * FROM meta_connections WHERE id='primary'").first<any>();
 if(row){
  const token=await openCredential(row.token_ciphertext,env.META_CREDENTIAL_ENCRYPTION_KEY);
  return {token,pageId:row.page_id,instagramId:row.instagram_id,apiVersion:row.api_version,pageName:row.page_name,instagramUsername:row.instagram_username,expiresAt:row.token_expires_at,publishingEnabled:!!row.publishing_enabled&&Date.parse(row.token_expires_at)>Date.now(),stored:true};
 }
 return {token:env.META_PAGE_ACCESS_TOKEN || '',pageId:env.META_PAGE_ID || '',instagramId:env.META_INSTAGRAM_ID || '',apiVersion:env.META_API_VERSION || 'v26.0',pageName:'',instagramUsername:'',expiresAt:null,publishingEnabled:false,stored:false};
}
export async function metaConnectionStatus(){
 return publicConnection(await loadMetaCredential(),!!env.META_CREDENTIAL_ENCRYPTION_KEY);
}
export async function saveMetaCredential(input:any,actor:string){
 const c:MetaCredential={token:String(input.token || '').trim(),pageId:String(input.pageId || ''),instagramId:String(input.instagramId || ''),apiVersion:String(input.apiVersion || ''),pageName:'',instagramUsername:'',expiresAt:String(input.expiresAt || ''),publishingEnabled:false,stored:true};
 if(env.META_PAGE_ID && c.pageId!==env.META_PAGE_ID)throw new Error('Facebook-side-ID-en må være Bygdebladets side-ID.');
 if(env.META_INSTAGRAM_ID && c.instagramId!==env.META_INSTAGRAM_ID)throw new Error('Instagram-ID-en må være Bygdebladets konto-ID.');
 if(!c.expiresAt||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=Date.now()+60000)throw new Error('Legg inn en fremtidig utløpsdato fra Access Token Debugger.');
 const names=await verifyMetaCredential(c);
 const encrypted=await sealCredential(c.token,env.META_CREDENTIAL_ENCRYPTION_KEY);
 await database().prepare(`INSERT INTO meta_connections(id,token_ciphertext,page_id,instagram_id,api_version,page_name,instagram_username,token_expires_at,publishing_enabled,updated_by,updated_at) VALUES ('primary',?,?,?,?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET token_ciphertext=excluded.token_ciphertext,page_id=excluded.page_id,instagram_id=excluded.instagram_id,api_version=excluded.api_version,page_name=excluded.page_name,instagram_username=excluded.instagram_username,token_expires_at=excluded.token_expires_at,publishing_enabled=0,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
  .bind(encrypted,c.pageId,c.instagramId,c.apiVersion,names.pageName,names.instagramUsername,c.expiresAt,actor,new Date().toISOString()).run();
 return metaConnectionStatus();
}
export async function setMetaPublishingEnabled(enabled:boolean,actor:string){
 const c=await loadMetaCredential();if(!c.stored)throw new Error('Lagre tilkoblingen i skjemaet først.');
 if(enabled){if(!c.expiresAt||Date.parse(c.expiresAt)<=Date.now())throw new Error('Tilgangsnøkkelen har utløpt.');await verifyMetaCredential(c);}
 await database().prepare("UPDATE meta_connections SET publishing_enabled=?,updated_by=?,updated_at=? WHERE id='primary'").bind(Number(enabled),actor,new Date().toISOString()).run();
 return metaConnectionStatus();
}
