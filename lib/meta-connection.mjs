export function publicConnection(c, secureStorageReady) {
 const expired=!!c.expiresAt&&Date.parse(c.expiresAt)<=Date.now();
 const configured=!!(c.token&&c.pageId&&c.apiVersion);
 return {facebook:configured&&!expired,instagram:configured&&!!c.instagramId&&!expired,configured,expired,
  pageId:c.pageId,instagramId:c.instagramId,apiVersion:c.apiVersion,pageName:c.pageName,instagramUsername:c.instagramUsername,
  expiresAt:c.expiresAt,publishingEnabled:c.publishingEnabled&&!expired,secureStorageReady};
}
// Fixed HTTPS destination; credentials never appear in URLs or provider errors.
export async function verifyMetaCredential(c, request=fetch) {
 if(!/^v\d+\.\d+$/.test(c.apiVersion)||!/^\d{8,30}$/.test(c.pageId)||!/^\d{8,30}$/.test(c.instagramId))throw new Error('Kontroller konto-ID-er og API-versjon.');
 if(!c.token||c.token.length<30||c.token.length>8192||/\s/.test(c.token))throw new Error('Lim inn hele sidenøkkelen uten mellomrom.');
 async function get(path,fields){
  const url=new URL(`https://graph.facebook.com/${c.apiVersion}/${path}`);url.searchParams.set('fields',fields);
  const response=await request(url,{headers:{Authorization:`Bearer ${c.token}`},signal:AbortSignal.timeout(20000),redirect:'manual'});
  let data;try{data=await response.json();}catch{throw new Error('Meta svarte ikke som forventet. Prøv igjen.');}
  if(!response.ok||data.error){const code=Number(data.error?.code);throw new Error(code===190?'Meta avviste nøkkelen. Kontroller at den er gyldig.':`Meta kunne ikke bekrefte tilgangen${Number.isFinite(code)?' (kode '+code+')':''}. Kontroller tillatelsene i Meta.`);}
  return data;
 }
 const me=await get('me','id,name');
 if(me.id!==c.pageId)throw new Error('Nøkkelen tilhører ikke den valgte Facebook-siden. Bruk sidenøkkelen med Type Page.');
 const page=await get(c.pageId,'id,name,instagram_business_account');
 if(page.instagram_business_account?.id!==c.instagramId)throw new Error('Instagram-kontoen er ikke koblet til denne Facebook-siden.');
 const instagram=await get(c.instagramId,'id,username');
 if(instagram.id!==c.instagramId||typeof instagram.username!=='string')throw new Error('Kunne ikke bekrefte Instagram-kontoen.');
 return {pageName:String(page.name||''),instagramUsername:instagram.username};
}
