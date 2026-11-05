export const SOURCE_USER_AGENT='Bygdebladet-SoMe/2.1 (editorial tool; contact: annonse@bygdebladet.com)';
const transient=new Set([408,429,500,502,503,504]);
export async function fetchSource(url,{request=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;attempt<2;attempt++){
  let response;
  try{response=await request(url,{headers:{'User-Agent':SOURCE_USER_AGENT},redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch{
   if(!attempt){await wait(400);continue;}
   throw new Error('Kunne ikke nå nettavisen etter to forsøk. Prøv å hente igjen om litt. Eksisterende utkast er bevart.');
  }
  if(response.ok){
   if(Number(response.headers.get('content-length')||0)>12000000)throw new Error('Filen fra nettavisen er for stor.');
   try{
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>12000000)throw Object.assign(new Error('Filen fra nettavisen er for stor.'),{oversized:true});
    return new Response(bytes,{status:response.status,headers:response.headers});
   }catch(error){
    if(error.oversized)throw error;
    if(!attempt){await wait(400);continue;}
    throw new Error('Forbindelsen til nettavisen ble brutt under nedlasting. Prøv å hente igjen om litt. Eksisterende utkast er bevart.');
   }
  }
  if(!attempt&&transient.has(response.status)){
   // Respect a short Retry-After; leave longer rate limits to the next run.
   const seconds=Number(response.headers.get('retry-after'));
   if(response.status===429&&(!Number.isFinite(seconds)||seconds>2))throw new Error('Nettavisen ber oss vente. Prøv å hente igjen om litt.');
   await response.body?.cancel();await wait(Math.max(400,Math.min(2000,seconds*1000||0)));continue;
  }
  throw new Error(`Nettavisen svarte med HTTP ${response.status}. Prøv igjen senere hvis feilen er midlertidig.`);
 }
}
