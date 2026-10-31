import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers';
import { createPGliteFixture } from './neon-db-fixture';
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from '../scripts/fixtures';
import { seedRichVisual } from '../scripts/visual-rich-fixtures';
import { PortalService } from '../lib/service';
import { batch, rows } from '../lib/db';
import { engagementState } from '../lib/engagement-control';
import { ownerAIView } from '../lib/owner-ai';
import { aiModelChoices, modelPricing } from '../lib/ai-model-catalog';

for (const engine of ['sqlite','postgres'] as const) test(`${engine}: continuous voting, staff feedback and judging retain authorization and fixed length validation`, async () => {
 const f=engine==='sqlite'?await setup():await createPGliteFixture();
 if(engine==='postgres') await seedLocal(f.db);
 let now='2026-10-22T08:00:00.000Z';
 const service=(who:string)=>new PortalService(f.db, fixtures[who],LOCAL_CREDIT_KEY,()=>now);
 try {
  await seedRichVisual(f.db);
  await batch(f.db,[['INSERT INTO engagement_controls VALUES(1,1,1,1,?,?) ON CONFLICT(id) DO UPDATE SET voting_paused=1,feedback_paused=1','fake_admin',now]]);
  assert.equal((await engagementState(service('admin'))).votingPaused,false);
  for(const who of ['admin','owner']) {
   const view:any=await service(who).view('/projects');
   assert.equal(view.engagement.votingPaused,false);
   assert.equal(view.engagement.feedbackPaused,false);
   const post=(body:string)=>service(who).command('comment-project',{projectId:'visual_project_alice',body});
   for(const invalid of ['',' '.repeat(40),'x'.repeat(29),'😀'.repeat(29),'x'.repeat(1501)]) await assert.rejects(post(invalid));
   await post('  '+'x'.repeat(30)+'  ');
   await post('x'.repeat(1500));
   await post('😀'.repeat(30));
  }
  const ordinary:any=await service('alice').view('/projects');
  assert.equal(ordinary.engagement.feedbackPaused,true);
  await assert.rejects(service('alice').command('comment-project',{projectId:'visual_project_alice',body:'x'.repeat(30)}),{code:'ENGAGEMENT_PAUSED'});
  await service('admin').command('upvote-project',{projectId:'visual_project_alice'});
  await assert.rejects(service('admin').command('engagement-control',{votingPaused:true,feedbackPaused:true,version:1,reason:'Synthetic request to pause voting',confirmation:'CHANGE_ENGAGEMENT'}),{code:'VOTING_ALWAYS_OPEN'});
  await batch(f.db,[['INSERT INTO judge_assignments VALUES(?,?) ON CONFLICT DO NOTHING','fake_judge','fake_team1']]);
  for(const time of ['2026-10-22T08:00:00.000Z','2026-11-01T06:00:00.000Z','2026-11-02T18:00:00.000Z']) {
   now=time;
   await service('judge').command('judge-score',{teamId:'fake_team1',rating:8,notes:'Synthetic private evidence'});
  }
  await assert.rejects(service('alice').command('judge-score',{teamId:'fake_team1',rating:8}),{code:'JUDGE_REQUIRED'});
  assert.equal((await rows(f.db,"SELECT * FROM write_guards WHERE token LIKE 'staff-feedback:%'")).length,0);
  const owner=await ownerAIView(service('owner'));
  assert.equal(owner.costUSD,null);
  assert.equal(owner.choices.length,4);
  await assert.rejects(ownerAIView(service('admin')),{code:'OWNER_REQUIRED'});
 } finally { await f.db.close(); }
});

test('model catalog contains documented prices, never claims billed cost or account access',()=>{
 assert.deepEqual(aiModelChoices.map(x=>x.id),['gpt-6-astra','gpt-6.1-sol','gpt-6.1-terra','gpt-6-luna']);
 assert.equal(modelPricing.currency,'USD');
 assert.match(modelPricing.scope,/Account access is not verified/);
});
