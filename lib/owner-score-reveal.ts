import {z} from 'zod';
import {one,rows,assertPreviousWrite,type SQL} from './db';
import {demand,sha256,auditReason} from './security';
import {releasedScoreComponents,type ReleasedScoreComponents} from './released-score-components';
import {weightage} from './policy-controls';
import type {PortalService} from './service';
type Entry={projectId:string;teamId:string;versionId:string;score:number;position:number;components:ReleasedScoreComponents};
async function prepare(service:PortalService){
 const actor=await service.staff(true),settings=await service.live();
 const disclosure=settings.policy.scoringDisclosure;
 demand(disclosure?.criteria.trim()&&disclosure.weightage.trim(),409,'SCORING_DISCLOSURE_UNCONFIRMED','Confirm the scoring criteria before revealing scores.');
 const before=(await one<{version:number}>(service.db,'SELECT version FROM scoring_revision WHERE id=1'))!.version;
 const saved=await rows<{id:string;policy_version:number;payload:string}>(service.db,'SELECT id,policy_version,payload FROM result_snapshots ORDER BY created_at DESC');
 demand(saved.length<=1,409,'RESULT_SET_REQUIRES_REVIEW');
 demand(!saved.length||saved[0].policy_version===settings.version,409,'RESULT_POLICY_CHANGED');
 const result=saved.length?JSON.parse(saved[0].payload) as Awaited<ReturnType<PortalService['compute']>>:await service.compute();
 demand(Array.isArray(result)&&result.length>0,409,'NO_RESULTS');
 const entries:Entry[]=[];
 for(const row of result){if(row.eligibility!=='eligible')continue;
  const project=await one<{id:string;published_version_id:string}>(service.db,"SELECT p.id,p.published_version_id FROM projects p WHERE p.team_id=? AND p.published_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='project' AND r.target_id=p.id) OR (r.kind='submission' AND r.target_id=p.published_version_id)))",row.teamId);
  const components=releasedScoreComponents(row.components);
  demand(project&&components&&Number.isInteger(row.rank)&&row.rank!>0,409,'CURRENT_SCORE_COVERAGE_REQUIRED');
  // New snapshots carry explicit bindings. Older immutable snapshots remain readable.
  demand(!('versionId' in row)||row.versionId===project.published_version_id,409,'SCORE_VERSION_CHANGED');
  entries.push({projectId:project.id,teamId:row.teamId,versionId:project.published_version_id,score:components.total,position:row.rank!,components});
 }
 entries.sort((a,b)=>a.position-b.position);demand(entries.length>0&&entries.every((entry,index)=>entry.position===index+1),409,'FINAL_ORDER_INCOMPLETE');
 const after=(await one<{version:number}>(service.db,'SELECT version FROM scoring_revision WHERE id=1'))!.version;
 demand(before===after,409,'SCORING_CHANGED_RETRY','Scores changed while preparing release. Check readiness again.');
 return {actor,settings,revision:before,result,entries,snapshotId:saved[0]?.id||null,criteria:{criteria:disclosure!.criteria,weightage:weightage(settings.policy.weights),policyVersion:settings.version}};
}
async function token(state:Awaited<ReturnType<typeof prepare>>,expiresAt:string){return sha256(JSON.stringify({purpose:'owner-combined-reveal-v1',actor:state.actor.id,policy:state.settings.version,revision:state.revision,result:state.result,entries:state.entries,snapshot:state.snapshotId,expiresAt}))}
export async function ownerScoreReveal(service:PortalService,action:string,input:unknown){
 if(!['preview-reveal-scores','reveal-scores'].includes(action))return null;
 await service.staff(true);
 const existing=await one<{id:string;source_id:string}>(service.db,"SELECT id,source_id FROM score_releases WHERE stage='final'");
 if(existing)return {released:true,releaseId:existing.id,message:'Scores have already been revealed.'};
 if(action==='preview-reveal-scores'){
  z.object({}).strict().parse(input);const state=await prepare(service),expiresAt=new Date(Date.parse(service.now())+300_000).toISOString();
  return {token:await token(state,expiresAt),expiresAt,projects:state.entries.length,policyVersion:state.settings.version,sourceRevision:state.revision,warnings:['Revealing publishes current total and category scores to teams and the Showcase.','Judging, evaluation and submission edits become locked. Scores cannot be edited afterward.','Individual judge marks remain private. Voting follows the submission window; comments stay available.'],message:'Readiness checked. Nothing has been published.'};
 }
 const data=z.object({token:z.string().min(32),expiresAt:z.string().datetime(),confirmation:z.literal('REVEAL_SCORES'),reason:auditReason().default('Owner confirmed combined score release')}).strict().parse(input);
 const state=await prepare(service),now=Date.parse(service.now()),expiry=Date.parse(data.expiresAt);
 demand(expiry>now&&expiry<=now+300_000&&data.token===await token(state,data.expiresAt),409,'REVEAL_PREVIEW_STALE','Results changed or the preview expired. Check readiness again.');
 const snapshotId=state.snapshotId||crypto.randomUUID(),releaseId=crypto.randomUUID(),guard='owner-release:'+crypto.randomUUID();
 const statements:SQL[]=[['INSERT INTO write_guards SELECT ?,1 WHERE (SELECT version FROM scoring_revision WHERE id=1)=? AND (SELECT version FROM event_settings WHERE id=1)=? AND NOT EXISTS(SELECT 1 FROM score_releases WHERE stage=\'final\')',guard,state.revision,state.settings.version],...assertPreviousWrite(),['DELETE FROM write_guards WHERE token=?',guard]];
 if(!state.snapshotId)statements.push(['INSERT INTO result_snapshots VALUES(?,?,?,?,?,?)',snapshotId,state.settings.version,state.revision,JSON.stringify(state.result),service.now(),state.actor.id]);
 statements.push(["UPDATE evaluation_runs SET state='stale',score=NULL,error='Stopped at owner score release',updated_at=? WHERE state IN ('queued','running')",service.now()],["UPDATE astra_jobs SET state='needs_review',error='Stopped at owner score release',updated_at=? WHERE state IN ('pending','running','failed_retryable')",service.now()]);
 statements.push(['INSERT INTO score_releases VALUES(?,?,?,?,?,?,?)',releaseId,'final',snapshotId,JSON.stringify(state.entries),JSON.stringify(state.criteria),service.now(),state.actor.id]);
 const publication=await one<{snapshot_id:string}>(service.db,'SELECT snapshot_id FROM result_publication WHERE id=1');
 demand(!publication||publication.snapshot_id===snapshotId,409,'PUBLICATION_CHANGED');
 if(!publication)statements.push(['INSERT INTO result_publication VALUES(1,?,?)',snapshotId,service.now()]);
 await service.mutate(state.actor.id,'reveal-scores',releaseId,statements,{projects:state.entries.length,sourceRevision:state.revision,policyVersion:state.settings.version,combinedCapture:!state.snapshotId},data.reason);
 return {released:true,releaseId,message:'Scores are now revealed. Judging is locked.'};
}
