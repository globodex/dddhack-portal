import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './helpers';import {seedRichVisual} from '../scripts/visual-rich-fixtures';import {rows} from '../lib/db';import {privateReviewValues} from '../app/portal';
test('new judge inputs use explicit100 scale, retain canonical historical10 scale and true zero without rewriting history',async()=>{
 const f=await setup();try{await seedRichVisual(f.db);const s=f.service('admin'),base={projectId:'visual_project_alice',versionId:'visual_alice_v2',body:'Synthetic private judging feedback'};
 for(const [rating,ratingScale,stored] of [[8,10,8],[80,100,8],[0,100,0],[100,100,10]] as const){await s.command('review-project',{...base,rating,ratingScale});const values=await rows<any>(f.db,'SELECT rating FROM project_review_history WHERE project_id=? AND author_id=? ORDER BY rowid DESC LIMIT 1',base.projectId,'fake_admin');assert.equal(values[0].rating,stored);}
 for(const rating of [-1,101,Infinity])await assert.rejects(s.command('review-project',{...base,rating,ratingScale:100}));
 await assert.rejects(f.service('alice').command('review-project',{...base,rating:90,ratingScale:100}));
 const form=new FormData();form.set('rating','0');assert.equal(privateReviewValues(form,'admin',base.projectId,base.versionId).rating,0);assert.equal(privateReviewValues(form,'admin',base.projectId,base.versionId).ratingScale,100);
 }finally{f.db.close()}
});
test('legacy judging API accepts declared hundred-point marks while preserving historical ten-point clients',async()=>{
 const f=await setup();try{await f.service('judge').actor();await f.db.prepare("UPDATE users SET role='judge' WHERE id='fake_judge'").all();await f.db.prepare("INSERT INTO judge_assignments(judge_id,team_id) VALUES('fake_judge','fake_team1') ON CONFLICT DO NOTHING").all();
 for(const [rating,ratingScale,stored] of [[8,10,8],[80,100,8],[0,100,0],[100,100,10]]){await f.service('judge').command('judge-score',{teamId:'fake_team1',rating,ratingScale});const values=await rows<any>(f.db,"SELECT rating FROM human_scores WHERE judge_id='fake_judge' AND team_id='fake_team1'");assert.equal(values[0].rating,stored)}
 await assert.rejects(f.service('judge').command('judge-score',{teamId:'fake_team1',rating:80}));
 }finally{f.db.close()}
});
