import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {legacyLedgerIndependentFixture} from './legacy-ledger-independent-fixture';
import {applyPortalMigrations} from '../neon/db/migrate';
import {inspectPopulatedUpgrade,applyPopulatedUpgrade} from '../neon/db/populated-upgrade';
import type {PostgresPool} from '../neon/db/adapter';
const baseline=JSON.parse(readFileSync('evidence/neon-host-archive/historical-ledger-checksums.json','utf8'));
for(const encoding of ['lf','crlf'] as const) test(`0112 ${encoding}: exact17→19 suffix preserves all prior rows/checksums and rolls back failed trigger replacement`,async()=>{
 const f=await legacyLedgerIndependentFixture(encoding);
 try {
  await applyPortalMigrations(f.pool,f.plan.slice(7,17));
  const target={host:'synthetic-continuous.invalid',port:'5432',...f.identity};
  const before=await f.snapshot();
  const inspect=()=>inspectPopulatedUpgrade(f.pool,f.plan,baseline,target);
  const receipt=await inspect();assert.equal(receipt.ledger.length,17);assert.deepEqual(receipt.pending,['0112_continuous_engagement.sql', '0113_submission_vote_window.sql']);
  const defs=async()=> (await f.engine.query("SELECT proname,prosrc FROM pg_proc WHERE proname IN ('portal_trigger_feedback_guard','portal_trigger_community_feedback_paused','portal_trigger_legacy_feedback_paused') ORDER BY proname")).rows;
  const original=await defs();
  const failing:PostgresPool={async connect(){const c=await f.pool.connect();return {query:(sql,values)=>c.query(sql===f.plan[17].sql?sql+'; SELECT synthetic_failure_0112()':sql,values),release:(error)=>c.release(error)}},end:()=>f.pool.end()};
  await assert.rejects(applyPopulatedUpgrade(failing,f.plan,baseline,target,receipt,{backupCheckpoint:'synthetic-restore-verified',restoreVerified:true}));
  assert.deepEqual(await f.snapshot(),before);assert.deepEqual(await defs(),original);
  const result=await applyPopulatedUpgrade(f.pool,f.plan,baseline,target,await inspect(),{backupCheckpoint:'synthetic-restore-verified',restoreVerified:true});
  assert.deepEqual(result.applied,['0112_continuous_engagement.sql', '0113_submission_vote_window.sql']);
  const after=await f.snapshot();for(const [name,rows] of Object.entries(before)) if(name!=='portal_schema_migrations') assert.deepEqual(after[name],rows,name);
  assert.deepEqual((after.portal_schema_migrations as unknown[]).slice(0,17),before.portal_schema_migrations);
  const repeat=await inspect();assert.equal(repeat.ledger.length,19);assert.deepEqual(repeat.pending,[]);
 }finally{await f.db.close()}
});
