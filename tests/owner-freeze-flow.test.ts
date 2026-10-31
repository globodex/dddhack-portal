import assert from 'node:assert/strict';
import test from 'node:test';
import {setup,rehearsalPolicy,submission,attend} from './helpers';
import {createPGliteFixture} from './neon-db-fixture';
import {seedLocal,fixtures,LOCAL_CREDIT_KEY} from '../scripts/fixtures';
import {PortalService} from '../lib/service';
import {batch,one,rows} from '../lib/db';
import {resultControls} from '../lib/result-controls';
import {submissionAccess} from '../lib/team-access';

for(const engine of ['sqlite','postgres'] as const) for(const when of ['2026-10-31T08:00:00.000Z','2026-11-01T06:00:00.000Z','2026-11-02T08:00:00.000Z']) test(`${engine}: explicit owner preview/freeze at ${when} is independent of participant dates and immutable`,async()=>{
 const f=engine==='sqlite'?await setup():await createPGliteFixture();if(engine==='postgres')await seedLocal(f.db);
 let now=when;const service=(who='alice')=>new PortalService(f.db,fixtures[who],LOCAL_CREDIT_KEY,()=>now);
 try{
  await batch(f.db,[['UPDATE event_settings SET policy=?,active=1 WHERE id=1',JSON.stringify({...rehearsalPolicy,judgingClose:null,appealClose:null,engagementOpen:null,engagementClose:null})],['INSERT INTO portal_roles VALUES(?,?,?,?)','fake_alice','admin','fake_owner',now]]);
  await attend(f.db,'fake_bob');
  const ordinary=await submissionAccess(service('bob'),'fake_team3');assert.equal(ordinary.canCommit,when==='2026-11-01T06:00:00.000Z');
  const commit=await service().command('submit-project',{revision:0,project:{projectName:'Synthetic timed freeze project',problemSolution:submission.problemSolution,description:submission.description,github:submission.github,logo:submission.logo,banner:submission.banner,attestation:true}});
  const values={projectId:commit.projectId,versionId:commit.versionId};
  for(const who of ['admin','bob'])await assert.rejects(service(who).command('preview-freeze-results',{}),{code:'OWNER_REQUIRED'});
  await assert.rejects(service('owner').command('preview-freeze-results',{}),{code:'REVIEW_INCOMPLETE'});
  await service('admin').command('review',{teamId:'fake_team1',versionId:commit.versionId,eligibility:'eligible',astra:20,codex:4,diversity:7,falseClaims:0,evidence:'Synthetic reviewed score evidence'});
  await assert.rejects(service('owner').command('preview-freeze-results',{}),{code:'SCORE_COVERAGE_INCOMPLETE'});
  await service('admin').command('review-project',{...values,rating:8,body:'Synthetic current-version human review'});
  assert.equal((await resultControls(service('owner'))).freeze.allowed,true);
  const preview:any=await service('owner').command('preview-freeze-results',{});assert.equal(preview.projects,1);assert.equal((await rows(f.db,'SELECT * FROM result_snapshots')).length,0);
  await assert.rejects(service('owner').command('freeze-results',{}));
  await assert.rejects(service('admin').command('freeze-results',{...preview,confirmation:'FREEZE_RESULTS'}),{code:'OWNER_REQUIRED'});
  const confirm=(p:any)=>service('owner').command('freeze-results',{token:p.token,expiresAt:p.expiresAt,confirmation:'FREEZE_RESULTS'});
  await service('admin').command('review-project',{...values,rating:9,body:'Changed synthetic human review'});
  await assert.rejects(confirm(preview),{code:'FREEZE_PREVIEW_STALE'});
  const policyPreview:any=await service('owner').command('preview-freeze-results',{});
  await batch(f.db,[['UPDATE event_settings SET version=version+1 WHERE id=1']]);
  await assert.rejects(confirm(policyPreview),{code:'FREEZE_PREVIEW_STALE'});
  const expiring:any=await service('owner').command('preview-freeze-results',{});now=new Date(Date.parse(now)+300_001).toISOString();await assert.rejects(confirm(expiring),{code:'FREEZE_PREVIEW_STALE'});
  const fresh:any=await service('owner').command('preview-freeze-results',{});
  const snapshot=await confirm(fresh);assert.ok(snapshot.snapshotId);
  assert.equal((await rows(f.db,'SELECT * FROM result_publication')).length,0);
  await assert.rejects(service('admin').command('review-project',{...values,rating:7,body:'Forbidden after immutable freeze'}),{code:'RESULTS_FROZEN'});
  await assert.rejects(service().command('submit-project',{revision:1,project:{projectName:'Forbidden frozen edit',problemSolution:submission.problemSolution,description:submission.description,github:submission.github,logo:submission.logo,banner:submission.banner,attestation:true}}),{code:'RESULTS_FROZEN'});
  await assert.rejects(service('owner').command('preview-freeze-results',{}),{code:'RESULTS_FROZEN'});
  await assert.rejects(f.db.prepare("UPDATE result_snapshots SET payload='[]' WHERE id=?").bind(snapshot.snapshotId).all(),/IMMUTABLE/);
  const saved=await one<{source_revision:number}>(f.db,'SELECT source_revision FROM result_snapshots');assert.equal(saved!.source_revision,fresh.sourceRevision);
 }finally{await f.db.close()}
});
