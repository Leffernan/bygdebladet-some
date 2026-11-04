import { env } from 'cloudflare:workers';
import type {AppUser} from './types';
import { userInput, userChangeAllowed, accountAllowsIdentity } from './profile-policy.mjs';
const date=()=>new Date().toISOString();
const database=()=>{if(!env.DB)throw new Error('Databasen er ikke tilgjengelig.');return env.DB;};
export function publicUser(row:any):AppUser{return {id:row.id,email:row.email,displayName:row.display_name,role:row.role,active:!!row.active,linked:!!row.auth_subject,lastSeenAt:row.last_seen_at,createdAt:row.created_at,updatedAt:row.updated_at};}
export async function ensureOwner(){
 const email=env.APP_OWNER_EMAIL?.trim().toLowerCase();if(!email)throw new Error('Eierens brukertilgang er ikke klargjort.');
 await database().prepare("INSERT INTO app_users(id,email,display_name,role,active,created_at,updated_at) VALUES('owner',?,?,'owner',1,?,?) ON CONFLICT(id) DO NOTHING").bind(email,env.APP_OWNER_NAME||email,date(),date()).run();
}
export async function resolveUser(req:Request):Promise<AppUser>{
 const subject=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 if(!subject||!email)throw Object.assign(new Error('Logg inn med ChatGPT for å gjøre endringer.'),{status:401});
 await ensureOwner();
 let row=await database().prepare('SELECT * FROM app_users WHERE auth_subject=?').bind(subject).first<any>();
 if(!row){
  row=await database().prepare('SELECT * FROM app_users WHERE email=?').bind(email).first<any>();
  if(!accountAllowsIdentity(row,subject,email))throw Object.assign(new Error('Brukeren din har ikke aktiv tilgang til SoMe. Kontakt en kollega med tilgang.'),{status:403});
  await database().prepare('UPDATE app_users SET auth_subject=? WHERE id=? AND auth_subject IS NULL AND active=1').bind(subject,row.id).run();
  row=await database().prepare('SELECT * FROM app_users WHERE id=?').bind(row.id).first<any>();
  if(row.auth_subject!==subject)throw Object.assign(new Error('Innloggingen er allerede koblet til en annen konto.'),{status:403});
 }
 if(!accountAllowsIdentity(row,subject,email))throw Object.assign(new Error('Brukeren din er deaktivert.'),{status:403});
 if(!row.last_seen_at||Date.now()-Date.parse(row.last_seen_at)>300000){row.last_seen_at=date();await database().prepare('UPDATE app_users SET last_seen_at=? WHERE id=?').bind(row.last_seen_at,row.id).run();}
 return publicUser(row);
}
export async function listUsers(){await ensureOwner();const rows=await database().prepare("SELECT * FROM app_users ORDER BY CASE WHEN role='owner' THEN 0 ELSE 1 END,active DESC,display_name COLLATE NOCASE").all();return rows.results.map(publicUser);}
export async function saveUser(input:any,actor:AppUser,id?:string){
 const next=userInput(input),current=id?await database().prepare('SELECT * FROM app_users WHERE id=?').bind(id).first<any>():null;
 if(id&&!current)throw new Error('Fant ikke brukeren.');
 const active=typeof input.active==='boolean'?input.active:current?!!current.active:true;
 if(current)userChangeAllowed(current,{...next,active},actor.id);
 const duplicate=await database().prepare('SELECT id FROM app_users WHERE email=? AND id!=?').bind(next.email,id||'').first();
 if(duplicate)throw new Error('Det finnes allerede en bruker med denne e-postadressen.');
 const savedId=id||crypto.randomUUID();
 try{
  if(current)await database().prepare('UPDATE app_users SET email=?,display_name=?,active=?,updated_at=? WHERE id=?').bind(next.email,next.displayName,Number(active),date(),id).run();
  else await database().prepare("INSERT INTO app_users(id,email,display_name,role,active,created_at,updated_at) VALUES(?,?,?,'editor',1,?,?)").bind(savedId,next.email,next.displayName,date(),date()).run();
 }catch{throw new Error('Brukeren kunne ikke lagres. Kontroller at e-postadressen ikke er i bruk, og last inn på nytt.');}
 return publicUser(await database().prepare('SELECT * FROM app_users WHERE id=?').bind(savedId).first());
}
