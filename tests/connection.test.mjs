import test from 'node:test';
import assert from 'node:assert/strict';
import { sealCredential, openCredential } from '../lib/credential-crypto.mjs';
import { publicConnection, verifyMetaCredential } from '../lib/meta-connection.mjs';
const secret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const credential={token:'TEST_ONLY_'.repeat(8),pageId:'117542971653699',instagramId:'17841401826198800',apiVersion:'v26.0',pageName:'Bygdebladet',instagramUsername:'bygdebladet',expiresAt:new Date(Date.now()+60*86400000).toISOString(),publishingEnabled:false};
test('stored credential uses authenticated encryption and a fresh IV each time',async()=>{
 const key=secret(),first=await sealCredential(credential.token,key),second=await sealCredential(credential.token,key);
 assert.notEqual(first,second);assert.ok(!first.includes(credential.token));assert.equal(await openCredential(first,key),credential.token);
 const altered=JSON.parse(first);const bytes=Uint8Array.from(atob(altered.data),c=>c.charCodeAt(0));bytes[0]^=1;altered.data=btoa(String.fromCharCode(...bytes));
 await assert.rejects(openCredential(JSON.stringify(altered),key));await assert.rejects(openCredential(first,secret()));
});
test('public status never exposes a credential; expiry disables both channels and publishing',()=>{
 const status=publicConnection(credential,true);
 assert.equal(status.facebook,true);assert.equal(status.instagram,true);assert.equal(status.publishingEnabled,false);
 assert.ok(!JSON.stringify(status).includes(credential.token));assert.equal('token' in status,false);
 const expired=publicConnection({...credential,expiresAt:'2020-01-01T00:00:00Z',publishingEnabled:true},true);
 assert.equal(expired.expired,true);assert.equal(expired.facebook,false);assert.equal(expired.instagram,false);assert.equal(expired.publishingEnabled,false);
});
function provider(patches={}){
 const calls=[];
 const data={me:{id:credential.pageId,name:'Bygdebladet'},[credential.pageId]:{id:credential.pageId,name:'Bygdebladet',instagram_business_account:{id:credential.instagramId}},[credential.instagramId]:{id:credential.instagramId,username:'bygdebladet'},...patches};
 return {calls,request:async(url,options)=>{calls.push({url,options});return Response.json(data[url.pathname.split('/').at(-1)]);}};
}
test('connection check only reads the exact Page and linked Instagram using a bearer header',async()=>{
 const fake=provider();assert.deepEqual(await verifyMetaCredential(credential,fake.request),{pageName:'Bygdebladet',instagramUsername:'bygdebladet'});
 assert.equal(fake.calls.length,3);
 for(const {url,options} of fake.calls){assert.equal(url.origin,'https://graph.facebook.com');assert.ok(!url.href.includes(credential.token));assert.equal(options.method,undefined);assert.equal(options.headers.Authorization,'Bearer '+credential.token);assert.equal(options.redirect,'manual');}
});
test('User tokens and mismatched linked accounts are rejected before storage',async()=>{
 await assert.rejects(verifyMetaCredential(credential,provider({me:{id:'10243963962896488'}}).request),/Type Page/);
 await assert.rejects(verifyMetaCredential(credential,provider({[credential.pageId]:{instagram_business_account:{id:'99999999'}}}).request),/ikke koblet/);
 await assert.rejects(verifyMetaCredential({...credential,apiVersion:'v26.0/evil'},()=>{throw Error('must not fetch');}),/API-versjon/);
});
test('provider error text cannot reflect a secret into API errors or the activity log',async()=>{
 await assert.rejects(verifyMetaCredential(credential,async()=>Response.json({error:{code:190,message:'echo '+credential.token}},{status:400})),error=>!error.message.includes(credential.token)&&/Meta avviste/.test(error.message));
});
