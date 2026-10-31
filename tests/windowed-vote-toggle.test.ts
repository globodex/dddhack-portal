import test from 'node:test';import assert from 'node:assert/strict';import {setup,activate} from './helpers';import {seedRichVisual} from '../scripts/visual-rich-fixtures';import {one,batch} from '../lib/db';
test('votes toggle idempotently only in submission window; public comments ignore retired pause controls',async()=>{
 const f=await setup();try{await seedRichVisual(f.db);await activate(f.db);const service=f.service('admin'),projectId='visual_project_alice';
 for(const time of ['2026-11-01T02:29:59.999Z','2026-11-01T10:30:00Z','2026-11-01T12:00:00Z']){f.clock(time);await assert.rejects(service.command('upvote-project',{projectId,voted:true}),/VOTING_CLOSED|Voting/);}
 f.clock('2026-11-01T08:00:00+05:30');await service.command('upvote-project',{projectId,voted:true});await service.command('upvote-project',{projectId,voted:true});assert.equal((await one<any>(f.db,'SELECT count(*) n FROM project_upvotes WHERE project_id=? AND user_id=?',projectId,'fake_admin'))?.n,1);
 await service.command('upvote-project',{projectId,voted:false});await service.command('upvote-project',{projectId,voted:false});assert.equal((await one<any>(f.db,'SELECT count(*) n FROM project_upvotes WHERE project_id=? AND user_id=?',projectId,'fake_admin'))?.n,0);
 f.clock('2026-11-01T10:30:00Z');await assert.rejects(service.command('upvote-project',{projectId,voted:false}));
 await batch(f.db,[["UPDATE engagement_controls SET feedback_paused=1,voting_paused=1 WHERE id=1"]]);await service.command('comment-project',{projectId,body:'Synthetic feedback remains available outside the voting window.'});
 await assert.rejects(batch(f.db,[["INSERT INTO project_upvotes VALUES(?,?,?)",projectId,'fake_admin','2026-11-01T10:30:00Z']]),/VOTING_CLOSED/);
 }finally{f.db.close()}
});
test('a settings change between vote eligibility read and mutation rolls back the toggle',async()=>{
 const f=await setup();try{await seedRichVisual(f.db);await activate(f.db);f.clock('2026-11-01T03:00:00Z');
 const originalBatch=f.db.batch.bind(f.db),prepare=f.db.prepare.bind(f.db);let voteMutation=false,changed=false;
 f.db.prepare=(sql:string)=>{if(sql.includes('CASE WHEN EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND version=?)'))voteMutation=true;return prepare(sql)};
 f.db.batch=async statements=>{if(voteMutation&&!changed){changed=true;await originalBatch([prepare('UPDATE event_settings SET version=version+1 WHERE id=1')]);}return originalBatch(statements)};
 await assert.rejects(f.service('admin').command('upvote-project',{projectId:'visual_project_alice',voted:true}));assert.equal(changed,true);
 assert.equal((await one<any>(f.db,'SELECT count(*) n FROM project_upvotes WHERE project_id=? AND user_id=?','visual_project_alice','fake_admin'))?.n,0);
 }finally{f.db.close()}
});
