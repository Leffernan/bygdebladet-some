const context = new TextEncoder().encode('bygdebladet-some/meta-credential/v1');
function toBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value) { return Uint8Array.from(atob(value),c=>c.charCodeAt(0)); }
async function key(raw) {
 if(!raw)throw new Error('Sikker lagring er ikke klargjort.');
 const bytes=fromBase64(raw);if(bytes.length!==32)throw new Error('Sikker lagring er ikke klargjort.');
 return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function sealCredential(token,secret) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context},await key(secret),new TextEncoder().encode(token));
 return JSON.stringify({v:1,iv:toBase64(iv),data:toBase64(new Uint8Array(ciphertext))});
}
export async function openCredential(value,secret) {
 const encrypted=JSON.parse(value);if(encrypted.v!==1)throw new Error('Ukjent nøkkelformat.');
 const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(encrypted.iv),additionalData:context},await key(secret),fromBase64(encrypted.data));
 return new TextDecoder().decode(decrypted);
}
