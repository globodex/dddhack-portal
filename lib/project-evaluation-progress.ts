import {one,type Database} from './db';
/** Caller must authorize the team/project. This projection never includes marks or provider errors. */
export async function projectEvaluationProgress(db:Database,projectId:string,versionId:string){
 const current=await one<{id:string;eligibility:string|null}>(db,'SELECT p.id,e.status eligibility FROM projects p LEFT JOIN project_eligibility e ON e.project_id=p.id AND e.version_id=p.published_version_id WHERE p.id=? AND p.published_version_id=?',projectId,versionId);
 if(!current)return null;
 if(current.eligibility==='ineligible')return {versionId,state:'ineligible',message:'Repository timing is ineligible. See the repository-date details below.'};
 if(await one(db,'SELECT id FROM result_snapshots LIMIT 1'))return {versionId,state:'locked',message:'Judging and evaluation are locked. Scores stay private until owner reveal.'};
 const run=await one<{state:string;provenance:string;score:number|null}>(db,'SELECT state,provenance,score FROM evaluation_runs WHERE project_id=? AND version_id=? ORDER BY updated_at DESC,id DESC LIMIT 1',projectId,versionId);
 const job=await one<{state:string;attempts:number}>(db,'SELECT state,attempts FROM astra_jobs WHERE version_id=?',versionId);
 const state=run?.state==='completed'&&run.provenance==='provider'&&typeof run.score==='number'&&Number.isFinite(run.score)?'completed':run?.state==='running'?'running':job&&job.attempts>=3?'review_required':run?.state==='failed'?'retry_pending':'pending';
 return {versionId,state,message:state==='completed'?'Evaluation complete. Scores remain hidden until the owner reveals them.':state==='running'?'Your project evaluation is in progress.':state==='review_required'?'Evaluation needs organizer review. Your submission is saved and is not marked ineligible.':state==='retry_pending'?'Evaluation is awaiting a retry. This does not make your project ineligible.':'Your submission is saved and awaiting evaluation.'};
}
