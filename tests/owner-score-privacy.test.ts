import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './helpers';import {batch} from '../lib/db';import {seedRichVisual} from '../scripts/visual-rich-fixtures';import {publicScores,revealCommand} from '../lib/score-release';
test('historic AI-only release never leaks scores before combined owner release',async()=>{
 const f=await setup();try{await seedRichVisual(f.db);await batch(f.db,[["INSERT INTO score_releases VALUES(?,'ai',?,?,NULL,?,'fake_admin')",'synthetic-release','synthetic-source',JSON.stringify([{projectId:'visual_project_alice',versionId:'visual_alice_v2',teamId:'visual_team_alice',score:27.193845}]),'2026-11-01']]);
 const value=await publicScores(f.service('alice'));assert.equal(value.stage,'community');assert.deepEqual(value.scores,[]);assert.doesNotMatch(JSON.stringify(value),/27\.193845|synthetic-source/);
 }finally{f.db.close()}
});
test('ordinary admin cannot reveal scores and obsolete stage actions are rejected',async()=>{
 const f=await setup();try{await assert.rejects(revealCommand(f.service('admin'),'reveal-final-scores',{}));await assert.rejects(revealCommand(f.service('owner'),'reveal-ai-scores',{}));}finally{f.db.close()}
});
