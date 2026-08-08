import { requirePermission, type AuthContext } from "../auth";
import { HttpError, json, randomId, type RuntimeEnv } from "../runtime";
import { asText, boolInt, clientDto, limitFrom, petDto, readBody } from "./common";

async function getClient(env:RuntimeEnv,auth:AuthContext,id:string){return env.DB.prepare(`SELECT * FROM clients WHERE id=? AND tenant_id=? AND module_id=? LIMIT 1`).bind(id,auth.tenantId,auth.moduleId).first<Record<string,unknown>>();}
async function petsFor(env:RuntimeEnv,auth:AuthContext,clientId:string){const rows=await env.DB.prepare(`SELECT * FROM pets WHERE client_id=? AND tenant_id=? AND module_id=? AND active=1 ORDER BY name`).bind(clientId,auth.tenantId,auth.moduleId).all<Record<string,unknown>>();return (rows.results??[]).map(petDto);}

export async function handleClients(request:Request,env:RuntimeEnv,auth:AuthContext,id?:string):Promise<Response>{
  if(request.method==='GET'){
    requirePermission(auth,'clients:read');
    if(id){const row=await getClient(env,auth,id);if(!row)throw new HttpError(404,'NOT_FOUND','Resource not found');return json({data:{...clientDto(row),pets:await petsFor(env,auth,id)}});}
    const url=new URL(request.url),search=(url.searchParams.get('search')??'').trim(),petId=(url.searchParams.get('petId')??'').trim(),limit=limitFrom(request);
    const term=`%${search}%`;
    const rows=petId
      ? await env.DB.prepare(`SELECT DISTINCT c.* FROM clients c JOIN pets p ON p.tenant_id=c.tenant_id AND p.module_id=c.module_id AND p.client_id=c.id WHERE c.tenant_id=? AND c.module_id=? AND c.active=1 AND p.active=1 AND p.id=? ORDER BY c.name LIMIT ?`).bind(auth.tenantId,auth.moduleId,petId,limit).all<Record<string,unknown>>()
      : search
        ? await env.DB.prepare(`SELECT DISTINCT c.* FROM clients c LEFT JOIN pets p ON p.tenant_id=c.tenant_id AND p.module_id=c.module_id AND p.client_id=c.id WHERE c.tenant_id=? AND c.module_id=? AND c.active=1 AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR p.name LIKE ? OR p.breed LIKE ?) ORDER BY c.name LIMIT ?`).bind(auth.tenantId,auth.moduleId,term,term,term,term,term,limit).all<Record<string,unknown>>()
        : await env.DB.prepare(`SELECT * FROM clients WHERE tenant_id=? AND module_id=? AND active=1 ORDER BY name LIMIT ?`).bind(auth.tenantId,auth.moduleId,limit).all<Record<string,unknown>>();
    const data=[];for(const row of rows.results??[])data.push({...clientDto(row),pets:await petsFor(env,auth,String(row.id))});return json({data});
  }

  if(request.method==='POST'){
    requirePermission(auth,'clients:write');const body=await readBody(request);const id=asText(body.id)??randomId('client');const name=asText(body.name);if(!name)throw new HttpError(400,'CLIENT_NAME_REQUIRED','Client name is required');
    const now=new Date().toISOString();const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO clients(id,tenant_id,module_id,name,document,phone,email,address,neighborhood,city,notes,active,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`).bind(id,auth.tenantId,auth.moduleId,name,asText(body.document),asText(body.phone),asText(body.email),asText(body.address),asText(body.neighborhood),asText(body.city),asText(body.notes),boolInt(body.active,true),now,now)];
    const pets=Array.isArray(body.pets)?body.pets:[];for(const raw of pets){const pet=(raw??{}) as Record<string,unknown>;const petId=asText(pet.id)??randomId('pet');const petName=asText(pet.name);if(!petName)throw new HttpError(400,'PET_NAME_REQUIRED','Pet name is required');const weight=pet.weightKg==null?null:Math.round(Number(pet.weightKg)*1000);statements.push(env.DB.prepare(`INSERT INTO pets(id,tenant_id,module_id,client_id,name,species,breed,birth_date,weight_grams,color,notes,active,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`).bind(petId,auth.tenantId,auth.moduleId,id,petName,asText(pet.species)??'other',asText(pet.breed),asText(pet.birthDate),weight,asText(pet.color),asText(pet.notes),boolInt(pet.active,true),now,now));}
    await env.DB.batch(statements);const row=await getClient(env,auth,id);return json({data:{...clientDto(row!),pets:await petsFor(env,auth,id)}},201);
  }

  if(request.method==='PATCH'&&id){
    requirePermission(auth,'clients:write');const current=await getClient(env,auth,id);if(!current)throw new HttpError(404,'NOT_FOUND','Resource not found');const body=await readBody(request);const value=(key:string)=>Object.prototype.hasOwnProperty.call(body,key)?body[key]:current[key];
    const statements:D1PreparedStatement[]=[env.DB.prepare(`UPDATE clients SET name=?,document=?,phone=?,email=?,address=?,neighborhood=?,city=?,notes=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND module_id=?`).bind(asText(value('name'))??String(current.name),asText(value('document')),asText(value('phone')),asText(value('email')),asText(value('address')),asText(value('neighborhood')),asText(value('city')),asText(value('notes')),boolInt(value('active'),Number(current.active)===1),id,auth.tenantId,auth.moduleId)];
    if(Array.isArray(body.pets)){for(const raw of body.pets){const pet=(raw??{}) as Record<string,unknown>;const petId=asText(pet.id)??randomId('pet'),petName=asText(pet.name);if(!petName)throw new HttpError(400,'PET_NAME_REQUIRED','Pet name is required');statements.push(env.DB.prepare(`INSERT INTO pets(id,tenant_id,module_id,client_id,name,species,breed,birth_date,weight_grams,color,notes,active,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,name=excluded.name,species=excluded.species,breed=excluded.breed,birth_date=excluded.birth_date,weight_grams=excluded.weight_grams,color=excluded.color,notes=excluded.notes,active=excluded.active,updated_at=CURRENT_TIMESTAMP`).bind(petId,auth.tenantId,auth.moduleId,id,petName,asText(pet.species)??'other',asText(pet.breed),asText(pet.birthDate),pet.weightKg==null?null:Math.round(Number(pet.weightKg)*1000),asText(pet.color),asText(pet.notes),boolInt(pet.active,true)));}}
    await env.DB.batch(statements);const row=await getClient(env,auth,id);return json({data:{...clientDto(row!),pets:await petsFor(env,auth,id)}});
  }

  if(request.method==='DELETE'&&id){requirePermission(auth,'clients:write');const row=await getClient(env,auth,id);if(!row)throw new HttpError(404,'NOT_FOUND','Resource not found');await env.DB.batch([env.DB.prepare(`UPDATE clients SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND module_id=?`).bind(id,auth.tenantId,auth.moduleId),env.DB.prepare(`UPDATE pets SET active=0,updated_at=CURRENT_TIMESTAMP WHERE client_id=? AND tenant_id=? AND module_id=?`).bind(id,auth.tenantId,auth.moduleId)]);return json({data:{ok:true}});}
  throw new HttpError(405,'METHOD_NOT_ALLOWED','Method not allowed');
}
