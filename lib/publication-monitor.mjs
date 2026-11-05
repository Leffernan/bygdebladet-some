// One queue-level timer: refreshing data must never postpone the next check.
// Meta recommends one status check per minute, with at most five checks.
export function startPublicationMonitor({getData,publish,refresh,onError,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const attempts=new Map();
  let stopped=false,timer;
  const schedule=()=>{if(!stopped)timer=setTimer(check,65000);};
  async function check(){
    try{
      const data=getData();
      if(!data||data.settings.paused||!data.connection.publishingEnabled)return;
      const waiting=data.posts.filter(p=>p.state==='approved'&&p.channels.every(c=>data.connection[c])&&p.deliveries.some(d=>['ready','processing','sending','unknown'].includes(d.state)));
      let checked=0;
      for(const post of waiting){
        if(stopped)break;
        const key=JSON.stringify([post.id,post.revision,post.deliveries.map(d=>[d.id,d.container_id||'']).sort()]);
        const count=attempts.get(key)||0;
        if(count>=5)continue;
        if(checked++>=5)break;
        attempts.set(key,count+1);
        try{
          const result=await publish(post.id);
          if(count===4&&result?.deliveries?.some(d=>d.state==='processing'))onError(new Error('Instagram har ikke bekreftet at bildet er klart etter fem kontroller. Åpne posten og bruk «Kontroller / publiser» for å kontrollere på nytt.'));
        }catch(error){if(!stopped)onError(error);}
      }
      if(waiting.length&&!stopped)await refresh();
    }catch(error){if(!stopped)onError(error);}
    finally{schedule();}
  }
  schedule();
  return()=>{stopped=true;clearTimer(timer);};
}
