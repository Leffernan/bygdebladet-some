import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSource,SOURCE_USER_AGENT} from '../lib/source-fetch.mjs';
import {apiRequest,NEWS_IMPORT_PATH} from '../lib/client-api.mjs';
const wait=async()=>{};
test('news import works with the EasyPrivacy /api/collect rule enabled',async()=>{
 // Real filter: /api/collect|$ping,xmlhttprequest (easyprivacy_general.txt).
 const filteredRequest=async(url,options)=>{
  if(url.endsWith('/api/collect'))throw TypeError('NetworkError when attempting to fetch resource.');
  assert.equal(url,'/api/news/import');assert.equal(options.method,'POST');
  return Response.json({added:0,existing:5,errors:[]});
 };
 await assert.rejects(apiRequest('collect','POST',{},filteredRequest),/Forbindelsen/);
 assert.deepEqual(await apiRequest(NEWS_IMPORT_PATH,'POST',{},filteredRequest),{added:0,existing:5,errors:[]});
});
test('source header is ASCII; a transient GET failure is retried and the complete response returned',async()=>{
 assert.match(SOURCE_USER_AGENT,/^[\x20-\x7e]+$/);
 let count=0;
 const response=await fetchSource('https://bygdebladet.com/',{wait,request:async(url,options)=>{assert.equal(options.redirect,'manual');assert.equal(options.method,undefined);assert.equal(options.headers['User-Agent'],SOURCE_USER_AGENT);if(++count===1)throw TypeError('NetworkError when attempting to fetch resource.');return new Response('news');}});
 assert.equal(await response.text(),'news');assert.equal(count,2);
});
test('interrupted response body is retried; persistent network failures get a readable message',async()=>{
 let count=0;
 const response=await fetchSource('https://bygdebladet.com/',{wait,request:async()=>++count===1?new Response(new ReadableStream({start(controller){controller.error(TypeError('connection reset'));}})):new Response('complete')});
 assert.equal(await response.text(),'complete');assert.equal(count,2);
 await assert.rejects(fetchSource('https://bygdebladet.com/',{wait,request:async()=>{throw TypeError('NetworkError');}}),/etter to forsøk/);
});
test('only transient HTTP failures retry; access denials and long rate limits do not',async()=>{
 let count=0;const r=await fetchSource('https://bygdebladet.com/',{wait,request:async()=>++count===1?new Response('busy',{status:503}):new Response('ok')});assert.equal(await r.text(),'ok');assert.equal(count,2);
 for(const status of [403,429]){count=0;await assert.rejects(fetchSource('https://bygdebladet.com/',{wait,request:async()=>{count++;return new Response('no',{status,headers:{'Retry-After':'60'}});}}));assert.equal(count,1);}
});
test('status GET retries a broken connection but mutations are never automatically replayed',async()=>{
 let count=0;const data=await apiRequest('data','GET',undefined,async()=>{if(++count===1)throw TypeError('NetworkError');return Response.json({posts:[]});});assert.deepEqual(data,{posts:[]});assert.equal(count,2);
 count=0;await assert.rejects(apiRequest('collect','POST',{},async()=>{count++;throw TypeError('NetworkError');}),/Handlingen kan ha blitt utført/);assert.equal(count,1);
});
test('expired sign-in and validation failures stay distinct and do not retry',async()=>{
 for(const [response,expected] of [[Response.json({error:'denied'},{status:401}),/Innloggingen/],[Response.json({error:'Skriv en tittel.'},{status:400}),/Skriv en tittel/],[new Response(null,{status:302}),/Innloggingen kan ha utløpt/]]){
  let count=0;await assert.rejects(apiRequest('data','GET',undefined,async()=>{count++;return response;}),expected);assert.equal(count,1);
 }
});
