import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { PortalService } from "../lib/service";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { discoverParticipants } from "../lib/discover-participants";

async function fixture() {
  const ctx = await setup();
  ctx.db.raw.prepare("UPDATE profiles SET bio='PRIVATE_BIO_SENTINEL',socials=?,gender='woman',gender_description='PRIVATE_GENDER_DESCRIPTION',public=0 WHERE user_id='fake_bob'").run(JSON.stringify(['https://github.com/synthetic-bob']));
  ctx.db.raw.prepare("UPDATE profile_details SET best_description='Working Professional',organization='PRIVATE_ORGANIZATION',openai_org_id='org-synthetic-private',phone='+12025550123' WHERE user_id='fake_bob'").run();
  return ctx;
}
const lookup = async (service: PortalService) => service.view('/discover/participants', { person:'fake_bob' }) as Promise<any>;
const privateMarkers = /PRIVATE_BIO_SENTINEL|synthetic-bob|PRIVATE_GENDER_DESCRIPTION|PRIVATE_ORGANIZATION|org-synthetic-private|12025550123|Working Professional/;

test('paginated directory and unauthenticated helper never gain selected-person private fields', async () => {
 const {db,service}=await fixture();try{
  for(const who of ['owner','admin','bob','alice','stranger']){const page:any=await service(who).view('/discover/participants');assert.doesNotMatch(JSON.stringify(page.items),privateMarkers);assert.ok(page.items.every((p:any)=>!('details' in p)&&!('gender' in p)&&!('genderDescription' in p)));}
  const anonymous=await discoverParticipants(db,{person:'fake_bob'});assert.deepEqual(anonymous.focusedPerson?.details,{});assert.doesNotMatch(JSON.stringify(anonymous),privateMarkers);
 }finally{db.close();}
});
test('explicit self/admin reads show actual private bio/socials and metadata; organization ID is admin only',async()=>{
 const {db,service}=await fixture();try{
  const own=await lookup(service('bob'));assert.equal(own.focusedPerson.bio,'PRIVATE_BIO_SENTINEL');assert.deepEqual(own.focusedPerson.socials,['https://github.com/synthetic-bob']);assert.equal(own.focusedPerson.details.profession,'Working Professional');assert.equal(own.focusedPerson.details.organization,'PRIVATE_ORGANIZATION');assert.equal(own.focusedPerson.details.gender,'woman');assert.ok(!('openaiOrgId' in own.focusedPerson.details));
  for(const who of ['owner','admin']){const page=await lookup(service(who));assert.equal(page.focusedPerson.details.openaiOrgId,'org-synthetic-private');assert.equal(page.focusedPerson.details.phone,'+12025550123');assert.equal(page.focusedPerson.details.whatsappUrl,'https://wa.me/12025550123');assert.doesNotMatch(JSON.stringify(page.items),privateMarkers);}
 }finally{db.close();}
});
test('selected gender is public to the existing audience while cross-team and Viewer lookup cannot gain private metadata; current teammate phone is revoked immediately after removal',async()=>{
 const {db,service}=await fixture();try{
  for(const who of ['alice','stranger']){const page=await lookup(service(who));assert.deepEqual(page.focusedPerson.details,{gender:'woman'});assert.doesNotMatch(JSON.stringify(page),privateMarkers);}
  const teammate=await lookup(service('carol'));assert.deepEqual(teammate.focusedPerson.details,{gender:'woman',phone:'+12025550123',whatsappUrl:'https://wa.me/12025550123'});assert.equal(teammate.focusedPerson.bio,'');assert.deepEqual(teammate.focusedPerson.socials,[]);
  db.raw.prepare("DELETE FROM memberships WHERE user_id='fake_carol'").run();assert.deepEqual((await lookup(service('carol'))).focusedPerson.details,{gender:'woman'});
 }finally{db.close();}
});
test('fresh role/removal checks and public consent apply to every selected-person request',async()=>{
 const {db,service}=await fixture();try{
  assert.ok((await lookup(service('admin'))).focusedPerson.details.openaiOrgId);
  db.raw.prepare("INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_admin','volunteer','fake_owner','2026-10-24T00:00:00Z') ON CONFLICT(user_id) DO UPDATE SET role='volunteer'").run();assert.deepEqual((await lookup(service('admin'))).focusedPerson.details,{gender:'woman'});
  db.raw.prepare("UPDATE profiles SET public=1 WHERE user_id='fake_bob'").run();const viewer=await lookup(service('stranger'));assert.equal(viewer.focusedPerson.bio,'PRIVATE_BIO_SENTINEL');assert.deepEqual(viewer.focusedPerson.details,{gender:'woman'});
  db.raw.prepare("INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant','fake_bob',1,'Synthetic profile privacy removal','fake_owner','2026-10-24T00:00:00Z')").run();assert.equal((await lookup(service('bob'))).focusedPerson,null);assert.equal((await service('stranger').view('/discover/participants',{person:'fake_stranger'}) as any).focusedPerson,null);
 }finally{db.close();}
});
test('an API-key-shaped value saved in the org field is never projected',async()=>{
 const {db,service}=await fixture();try{db.raw.prepare("UPDATE profile_details SET openai_org_id='sk-proj-DO-NOT-EXPOSE' WHERE user_id='fake_bob'").run();assert.ok(!('openaiOrgId' in (await lookup(service('owner'))).focusedPerson.details));}finally{db.close();}
});

test('PostgreSQL selected-person queries preserve the same authorization and current-membership boundary',async()=>{
 const {createPGliteFixture}=await import('./neon-db-fixture');const {seedLocal}=await import('../scripts/fixtures');const {batch}=await import('../lib/db');const {db,pool}=await createPGliteFixture();
 try{await seedLocal(db);await batch(db,[["UPDATE profiles SET public=0,bio='PRIVATE_PG_BIO' WHERE user_id='fake_bob'"],["UPDATE profile_details SET best_description='Working Professional',organization='PRIVATE_PG_ORG',openai_org_id='org-private-pg',phone='+12025550123' WHERE user_id='fake_bob'"]]);const service=(who:string)=>new PortalService(db,fixtures[who],LOCAL_CREDIT_KEY);
 assert.equal((await lookup(service('admin'))).focusedPerson.details.openaiOrgId,'org-private-pg');assert.equal((await lookup(service('bob'))).focusedPerson.details.organization,'PRIVATE_PG_ORG');assert.deepEqual((await lookup(service('alice'))).focusedPerson.details,{gender:'non-binary'});assert.equal((await lookup(service('carol'))).focusedPerson.details.whatsappUrl,'https://wa.me/12025550123');await batch(db,[["DELETE FROM memberships WHERE user_id='fake_carol'"]]);assert.deepEqual((await lookup(service('carol'))).focusedPerson.details,{gender:'non-binary'});
 }finally{await pool.end();}
});
