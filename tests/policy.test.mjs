import {formatCaptions, readSharedCaption, splitCaption} from '../lib/captions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {canApprove,mayPublish,editable,osloSlot} from '../lib/policy.mjs';
import {frontpage,parseArticle,articleUrl,imageUrl,hashtags} from '../lib/articles.mjs';
const draft={state:'draft',revision:3,title:'Ei viktig sak',imageUrl:'https://bygdebladet.com/bilder/web/foto.jpg',channels:['facebook','instagram'],instagramText:'Les saka'};
const checks={content:true,credit:true,privacy:true};
test('one explicit human confirmation approves the current saved revision',()=>{
 assert.equal(canApprove(draft,3,true),true);
 for(const confirmation of [false,undefined,'true',1])assert.throws(()=>canApprove(draft,3,confirmation),/Bekreft/);
 assert.equal(canApprove(draft,3,checks),true);
 assert.throws(()=>canApprove(draft,2,true),/endret/);
 assert.throws(()=>canApprove(draft,3,{...checks,privacy:false}),/personvern/);
 assert.throws(()=>canApprove({...draft,channels:[]},3,checks),/kanal/);
 assert.throws(()=>canApprove({...draft,instagramText:'a'.repeat(2201)},3,checks),/2200/);
});
test('only current human-approved snapshot is eligible; completed or unknown channels cannot retry',()=>{
 const post={state:'approved',revision:3,approved_revision:3,approved_by:'redaktor',image_key:'approved/3.jpg',channels:['facebook']};
 const delivery={state:'ready',revision:3,channel:'facebook'};
 assert.equal(mayPublish(post,delivery),true);
 for(const patch of [{state:'draft'},{approved_revision:2},{approved_by:null},{image_key:null},{channels:['instagram']}])assert.equal(mayPublish({...post,...patch},delivery),false);
 for(const state of ['sending','published','unknown','processing'])assert.equal(mayPublish(post,{...delivery,state}),false);
 assert.equal(editable([{state:'ready'},{state:'failed'}]),true);
 assert.equal(editable([{state:'published'},{state:'failed'}]),false);
});
test('frontpage order excludes menu, duplicates, and other domains, rather than sorting IDs',()=>{
 const a=(url)=>`<a class="nf-o-fl-post-tittelbox__link" href="${url}">sak</a>`;
 const html='<a href="/19.99999">Annonsering</a>'+a('/topp/19.10001')+a('/eldre/19.10000')+a('/topp/19.10001')+a('https://evilbygdebladet.com/19.99997')+a('/ny/19.10020');
 assert.deepEqual(frontpage(html,3).map(p=>p.id),['10001','10000','10020']);
 assert.throws(()=>frontpage('<a href="/19.99999">meny</a>'),/redaksjonelle/);
});
test('source URLs reject SSRF, credentials, ports and lookalike domains',()=>{
 for(const u of ['http://bygdebladet.com/19.10001','https://bygdebladet.com.evil.org/19.10001','https://x@bygdebladet.com/19.10001','https://bygdebladet.com:8443/19.10001'])assert.throws(()=>articleUrl(u));
 assert.equal(articleUrl('/sak/19.1.12345?utm_source=x#y').url,'https://bygdebladet.com/sak/19.1.12345');
 assert.throws(()=>imageUrl('https://127.0.0.1/bilder/a.jpg'));
 assert.throws(()=>imageUrl('https://bygdebladet.com/minside'));
});
test('metadata supplies category without section in URL; unrelated photo credit is ignored',()=>{
 const html='<meta content="Saka frå Sjøholt – nyheiter" property="og:title"><meta property="og:image" content="https://bygdebladet.com/bilder/web/a.jpg"><meta property="og:description" content="Nyhende &amp; folk"><meta property="article:section" content="Folk"><aside>Foto: Feil Fotograf</aside>';
 const p=parseArticle(html,'https://bygdebladet.com/saka/19.12345');
 assert.equal(p.category,'Folk');assert.equal(p.title,'Saka frå Sjøholt - nyheiter');assert.equal(p.intro,'Nyhende & folk');assert.equal(p.credit,'');assert.match(p.instagramText,/#ålesund/);assert.match(p.facebookText,/https:/);
});
test('municipal hashtags use whole names, including Norwegian characters',()=>{
 assert.equal(hashtags('Sjøholt og Brattvåg'),'#bygdebladet #ålesund #haram');assert.equal(hashtags('Moaen i ein fjord'),'#bygdebladet');
});
test('Oslo schedule follows DST; extra winter/summer run does not open a second slot',()=>{
 assert.match(osloSlot(new Date('2026-11-04T05:15:00Z')),/2026-11-04-360/);
 assert.match(osloSlot(new Date('2026-07-04T04:15:00Z')),/2026-07-04-360/);
 assert.equal(osloSlot(new Date('2026-11-04T04:15:00Z')),null);
 assert.equal(osloSlot(new Date('2026-07-04T05:15:00Z')),null);
});

test('editing the body from either channel keeps the right link line and Instagram hashtags',()=>{
 const url='https://bygdebladet.com/nyheiter/sak/16197';
 const tags='#bygdebladet #ålesund';
 const initial=formatCaptions('Gammal tekst',url,tags);
 for(const channel of ['facebook','instagram']){
  const edited=splitCaption(initial[channel+'Text'],channel,url).text+'\n\nNytt avsnitt.';
  const next=formatCaptions(edited,url,splitCaption(initial.instagramText,'instagram',url).tags);
  assert.equal(next.facebookText,edited+'\n\nLes heile saka: '+url);
  assert.equal(next.instagramText,edited+'\n\nLes heile saka på bygdebladet.com (lenke i bio)\n\n'+tags);
 }
 const withTrailingNewline=formatCaptions('Tekst\n',url,'#');
 assert.deepEqual(readSharedCaption({...withTrailingNewline,url,channels:['facebook','instagram']}),{text:'Tekst\n',tags:'#',differs:false});
});

test('a legacy draft keeps its saved previews until the shared caption is edited',()=>{
 const url='https://bygdebladet.com/nyheiter/sak/16197';
 const facebookText=formatCaptions('Tidlegare Facebook-tekst',url).facebookText;
 const instagramText=formatCaptions('Tidlegare Instagram-tekst',url,'#vestnes').instagramText;
 const post={url,facebookText,instagramText,channels:['facebook','instagram']};
 assert.deepEqual(readSharedCaption(post),{text:'Tidlegare Instagram-tekst',tags:'#vestnes',differs:true});
 assert.equal(readSharedCaption({...post,channels:['facebook']}).text,'Tidlegare Facebook-tekst');
 const saved={...post,...formatCaptions('Oppdatert tekst',url,'#vestnes')};
 assert.deepEqual(readSharedCaption(saved),{text:'Oppdatert tekst',tags:'#vestnes',differs:false});
});
