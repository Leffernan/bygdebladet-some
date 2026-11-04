import test from 'node:test';
import assert from 'node:assert/strict';
import {profileInput,userInput,userChangeAllowed,accountAllowsIdentity,validateLogo,headerTextColor} from '../lib/profile-policy.mjs';
test('profile validation bounds names and accepts only a real hex color',()=>{
 assert.deepEqual(profileInput({publicationName:' Bygdebladet ',solutionName:' SoMe ',brandColor:'#D81D1E'}),{publicationName:'Bygdebladet',solutionName:'SoMe',brandColor:'#d81d1e'});
 for(const patch of [{brandColor:'url(https://example.org)'},{solutionName:''},{solutionName:'a'.repeat(61)}])assert.throws(()=>profileInput({publicationName:'BB',solutionName:'SoMe',brandColor:'#d81d1e',...patch}));
 assert.equal(headerTextColor('#ffffff'),'#17202a');assert.equal(headerTextColor('#000000'),'#ffffff');assert.equal(headerTextColor('#d81d1e'),'#ffffff');
});
test('user input normalizes identities, and own or owner access cannot be disabled',()=>{
 assert.deepEqual(userInput({displayName:' Ola ',email:' OLA@BYGDEBLADET.COM '}),{displayName:'Ola',email:'ola@bygdebladet.com'});
 assert.throws(()=>userInput({displayName:'Ola',email:'ola'}));
 const row={id:'user1',email:'ola@example.org',auth_subject:'subject-1',role:'editor'};
 assert.throws(()=>userChangeAllowed(row,{email:row.email,active:false},row.id),/deaktivere/);
 assert.throws(()=>userChangeAllowed({...row,role:'owner'},{email:row.email,active:false},'other'),/eieren/);
 assert.throws(()=>userChangeAllowed(row,{email:'other@example.org',active:true},'other'),/innloggingen/);
 assert.doesNotThrow(()=>userChangeAllowed(row,{email:row.email,active:false},'other'));
});
test('only an active invited identity can bind or use an account; matching email cannot replace a bound subject',()=>{
 const row={email:'ola@example.org',active:1,auth_subject:null};
 assert.equal(accountAllowsIdentity(row,'subject-1',' Ola@Example.org '),true);
 assert.equal(accountAllowsIdentity(null,'subject-1','ola@example.org'),false);
 assert.equal(accountAllowsIdentity({...row,active:0},'subject-1',row.email),false);
 assert.equal(accountAllowsIdentity({...row,auth_subject:'subject-2'},'subject-1',row.email),false);
 assert.equal(accountAllowsIdentity({...row,auth_subject:'subject-1'},'subject-1','new@example.org'),true);
 assert.equal(accountAllowsIdentity(row,'','ola@example.org'),false);
});
test('logo uploads validate bytes and reject active SVG content and external references',()=>{
 const bytes=s=>new TextEncoder().encode(s);
 assert.equal(validateLogo(bytes('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>'),'image/svg+xml'),'svg');
 for(const svg of ['<svg><script>alert(1)</script></svg>','<svg onload="alert(1)"></svg>','<svg><use href="https://example.org/a.svg"/></svg>','<svg><style>@import "https://example.org/a.css"</style></svg>','<svg><path fill="url(https://example.org)"/></svg>'])assert.throws(()=>validateLogo(bytes(svg),'image/svg+xml'));
 assert.throws(()=>validateLogo(bytes('<html>bad</html>'),'image/png'));
 assert.throws(()=>validateLogo(new Uint8Array(5*1024*1024+1),'image/png'),/5 MB/);
 assert.equal(validateLogo(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),'png');
});
