import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {mayPublish} from '../lib/policy.mjs';
import {startPublicationMonitor} from '../lib/publication-monitor.mjs';

const code=ts.transpileModule(readFileSync(new URL('../lib/meta.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(request){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../drizzle/0000_thin_ultimo.sql',import.meta.url),'utf8'));
 const old=new Date(Date.now()-180000).toISOString();
 sql.prepare("INSERT INTO posts(id,url,title,image_url,facebook_text,instagram_text,state,revision,approved_revision,approved_by,image_key,image_hash,created_at,updated_at) VALUES('1','https://example.com/1','Approved title','https://example.com/image.jpg','Approved Facebook','Approved Instagram','approved',3,3,'Editor','approved/1.jpg','digest',?,?)").run(old,old);
 sql.prepare("INSERT INTO deliveries(id,post_id,channel,revision,state,stage_id,updated_at) VALUES('1:facebook','1','facebook',3,'published','fb-stage',?)").run(old);
 sql.prepare("INSERT INTO deliveries(id,post_id,channel,revision,state,stage_id,container_id,updated_at) VALUES('1:instagram','1','instagram',3,'processing','ig-stage','ig-container',?)").run(old);
 const database={prepare(query){const statement=sql.prepare(query);let args=[];return {bind(...next){args=next;return this;},async run(){const result=statement.run(...args);return {meta:{changes:Number(result.changes)}};},async first(){return statement.get(...args);},async all(){return {results:statement.all(...args)};}};}};
 const config={publishingEnabled:true,facebook:true,instagram:true,pageId:'page',instagramId:'ig'};
 const settings={paused:false};
 const server={db:()=>database,bucket:()=>{throw Error('Must reuse approved image stage');},now:()=>new Date().toISOString(),rawPost:async()=>sql.prepare("SELECT * FROM posts WHERE id='1'").get(),postDeliveries:async()=>sql.prepare("SELECT * FROM deliveries WHERE post_id='1'").all(),connection:async()=>config,settings:async()=>settings,log:async()=>{},hash:async()=>{throw Error('No image changes');}};
 const exports={};
 const require=name=>name==='./server'?server:name==='./policy.mjs'?{mayPublish}:name==='./meta-credentials'?{loadMetaCredential:async()=>({token:'test-only',apiVersion:'v26.0',publishingEnabled:config.publishingEnabled})}:(()=>{throw Error(name);})();
 new Function('require','exports','fetch',code)(require,exports,request);
 return {sql,config,settings,publish:exports.publishOne,deliveries:server.postDeliveries};
}
const response=data=>Response.json(data);
test('concurrent continuation checks publish Instagram once and preserve published Facebook',async()=>{
 let release,started,checks=0,sends=0;
 const waiting=new Promise(resolve=>{release=resolve;}),statusStarted=new Promise(resolve=>{started=resolve;});
 const f=fixture(async(url,options)=>{
  if(url.pathname.endsWith('/ig-container')){checks++;started();await waiting;return response({status_code:'FINISHED'});}
  if(url.pathname.endsWith('/media_publish')){sends++;assert.equal(options.body.get('creation_id'),'ig-container');return response({id:'ig-published'});}
  if(url.pathname.endsWith('/ig-published'))return response({permalink:'https://instagram.com/p/example'});
  throw Error('Unexpected request: '+url.pathname);
 });
 const first=f.publish('1');await statusStarted;
 await f.publish('1');release();await first;
 assert.equal(checks,1);assert.equal(sends,1);
 const rows=await f.deliveries();assert.ok(rows.every(d=>d.state==='published'));
 assert.equal(rows.find(d=>d.channel==='facebook').stage_id,'fb-stage');
 assert.equal(f.sql.prepare("SELECT state FROM posts WHERE id='1'").get().state,'published');f.sql.close();
});
test('already published Instagram is reconciled without another publish request',async()=>{
 let sends=0;const f=fixture(async(url,options)=>{if(options.method!=='GET')sends++;return response({status_code:'PUBLISHED'});});
 await f.publish('1');assert.equal(sends,0);assert.ok((await f.deliveries()).every(d=>d.state==='published'));f.sql.close();
});
test('pause, disabled publishing, changed approval and failed continuations never publish',async()=>{
 for(const change of ['paused','disabled','revision','failed']){
  let sends=0;const f=fixture(async(url,options)=>{if(options.method!=='GET')sends++;return response({status_code:'FINISHED'});});
  if(change==='paused')f.settings.paused=true;
  if(change==='disabled')f.config.publishingEnabled=false;
  if(change==='revision')f.sql.exec("UPDATE posts SET approved_revision=2 WHERE id='1'");
  if(change==='failed')f.sql.exec("UPDATE deliveries SET state='failed' WHERE channel='instagram'");
  await f.publish('1',{continuationOnly:true});assert.equal(sends,0,change);f.sql.close();
 }
});
test('uncertain publish outcome is checked instead of replaying the publish call',async()=>{
 let sends=0,published=false;
 const f=fixture(async(url,options)=>{
  if(options.method==='POST'){sends++;published=true;throw TypeError('Connection interrupted after Meta accepted the post');}
  return response({status_code:published?'PUBLISHED':'FINISHED'});
 });
 await f.publish('1');assert.equal((await f.deliveries()).find(d=>d.channel==='instagram').state,'unknown');
 await f.publish('1');assert.equal(sends,1);assert.ok((await f.deliveries()).every(d=>d.state==='published'));f.sql.close();
});
test('an unfinished container stays processing with a useful message, not a new container',async()=>{
 let checks=0;const f=fixture(async(url,options)=>{assert.equal(options.method,'GET');checks++;return response({status_code:'IN_PROGRESS'});});
 await f.publish('1');await f.publish('1');assert.equal(checks,1);
 const d=(await f.deliveries()).find(d=>d.channel==='instagram');assert.equal(d.state,'processing');assert.equal(d.container_id,'ig-container');assert.match(d.error,/Kontroller \/ publiser/);f.sql.close();
});
function monitorFixture(){
 let data={settings:{paused:false},connection:{publishingEnabled:true,instagram:true},posts:[{id:'1',revision:3,state:'approved',channels:['instagram'],deliveries:[{id:'1:instagram',container_id:'container',state:'processing'}]}]};
 let timer,canceled=false,published=0,refreshed=0;const errors=[];
 const stop=startPublicationMonitor({getData:()=>data,publish:async()=>{published++;return {deliveries:[{state:'processing'}]};},refresh:async()=>{refreshed++;},onError:error=>errors.push(error),setTimer:(callback,delay)=>{assert.equal(delay,65000);timer=callback;return callback;},clearTimer:()=>{canceled=true;}});
 return {stop,errors,get published(){return published;},get refreshed(){return refreshed;},get canceled(){return canceled;},get timer(){return timer;},refreshData:()=>{data=structuredClone(data);},data:()=>data,tick:()=>timer()};
}
test('the 60-second data refresh cannot cancel the 65-second queue check; no editor is required',async()=>{
 const f=monitorFixture(),original=f.timer;f.refreshData();assert.equal(f.timer,original);await f.tick();assert.equal(f.published,1);assert.equal(f.refreshed,1);f.stop();assert.equal(f.canceled,true);
});
test('queue monitor respects pause, completed channels and five-check limit',async()=>{
 const f=monitorFixture();f.data().settings.paused=true;await f.tick();assert.equal(f.published,0);
 f.data().settings.paused=false;f.data().posts[0].deliveries[0].state='published';await f.tick();assert.equal(f.published,0);
 f.data().posts[0].deliveries[0].state='processing';
 for(let i=0;i<7;i++){f.refreshData();await f.tick();}
 assert.equal(f.published,5);assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/fem kontroller/);f.stop();
});
