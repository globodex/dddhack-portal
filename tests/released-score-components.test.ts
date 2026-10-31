import {markCombinedRelease} from './helpers';
import test from 'node:test';import assert from 'node:assert/strict';import {releasedScoreComponents} from '../lib/released-score-components';import {setup} from './helpers';import {seedRichVisual} from '../scripts/visual-rich-fixtures';import {batch} from '../lib/db';import {PortalService} from '../lib/service';import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import ReleasedScoreBreakdown from '../app/released-score-breakdown';
const components={human:40,astra:25,diversity:8,codex:4,voting:3,bonus:2,penalties:0,total:82};
test('release breakdown keeps only complete canonical aggregate points and valid zeros',()=>{
 assert.deepEqual(releasedScoreComponents({...components,judgeMarks:[8,9],genderCounts:{male:3}},82),components);assert.equal(releasedScoreComponents({...components,human:null},82),null);assert.equal(releasedScoreComponents(components,83),null);
 const html=renderToStaticMarkup(createElement(ReleasedScoreBreakdown,{components,total:82}));assert.ok(html.indexOf('Judge score')<html.indexOf('AI score'));assert.doesNotMatch(html,/weighted average|judgeMarks|male/);assert.match(html,/Deductions/);
});
test('release total appears on list but breakdown only on detail, and no individual judge marks are projected',async()=>{
 const f=await setup();try{await seedRichVisual(f.db);await batch(f.db,[["INSERT INTO score_releases VALUES(?,'final',?,?,NULL,?,'fake_admin')",'synthetic-final','synthetic-source',JSON.stringify([{projectId:'visual_project_alice',versionId:'visual_alice_v2',teamId:'visual_team_alice',score:82,position:1,components:{...components,judgeMarks:[8,9]}}]),'2026-11-01']]);await markCombinedRelease(f.db,'synthetic-final');
 const service=new PortalService(f.db,null,undefined);const listing=await service.view('/projects') as any;const item=listing.items.find((p:any)=>p.id==='visual_project_alice');assert.equal(item.result.score,82);assert.equal(item.result.components,undefined);
 const detail=await service.view('/projects/'+item.slug) as any;assert.deepEqual(detail.items[0].result.components,components);assert.doesNotMatch(JSON.stringify(detail),/judgeMarks/);
 }finally{f.db.close()}
});
