const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// News ingestion must not use /api/collect: EasyPrivacy blocks that exact path
// as an analytics endpoint, even on the same origin.
export const NEWS_IMPORT_PATH='news/import';
export async function apiRequest(path,method='GET',body,request=fetch){
 const read=method==='GET';
 for(let attempt=0;attempt<(read?2:1);attempt++){
  let response,data;
  try{
   response=await request('/api/'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'manual',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(read?20000:90000)});
   if(response.type==='opaqueredirect'||response.status===401)throw Object.assign(new Error('Innloggingen må fornyes. Last inn siden på nytt og logg inn med ChatGPT.'),{known:true});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error('Appen svarte ikke som forventet. Last inn siden på nytt. Innloggingen kan ha utløpt.'),{known:true});
   data=await response.json();
  }catch(error){
   if(error.known)throw error;
   if(read&&!attempt){await wait(300);continue;}
   throw new Error(read?'Mistet kontakten med appen. Eksisterende utkast vises fortsatt. Vi prøver igjen ved neste oppdatering.':'Forbindelsen til appen ble brutt før svaret kom. Handlingen kan ha blitt utført. Oppdater status før du prøver igjen.');
  }
  if(!response.ok)throw new Error(data.error||'Handlingen kunne ikke fullføres. Prøv igjen senere.');
  return data;
 }
}
