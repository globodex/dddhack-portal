import {one,type Database} from './db';
/** Caller must authorize the team/project. This projection never includes marks or provider errors. */
export async function projectEvaluationProgress(db:Database,projectId:string,versionId:string){
 const current=await one<{id:string}>(db,'SELECT id FROM projects WHERE id=? AND published_version_id=?',projectId,versionId);
 if(!current)return null;
 const run=await one<{state:string;provenance:string;score:number|null}>(db,'SELECT state,provenance,score FROM evaluation_runs WHERE project_id=? AND version_id=? ORDER BY updated_at DESC,id DESC LIMIT 1',projectId,versionId);
 const state=run?.state==='completed'&&run.provenance==='provider'&&typeof run.score==='number'&&Number.isFinite(run.score)?'completed':run?.state==='running'?'running':run?.state==='failed'?'retry_pending':'pending';
 return {versionId,state,message:state==='completed'?'Evaluation complete. Scores remain hidden until the owner reveals them.':state==='running'?'Your project evaluation is in progress.':state==='retry_pending'?'Evaluation is awaiting a retry. This does not make your project ineligible.':'Your submission is saved and awaiting evaluation.'};
}
