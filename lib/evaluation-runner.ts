import {repositoryReadFailure} from './repository-read-error';
import {one,batch,assertPreviousWrite,type SQL} from './db';
import {demand} from './security';
import {reportSchema} from './evaluation';
import {validatedProviderGrade,storedEvaluationReport} from './provider-grade';
import type {PortalService} from './service';
export type EvaluationBinding={projectId:string;versionId:string};
export type EvaluationPreparation={projectId:string;versionId:string;payload:Record<string,unknown>;runId:string};
export async function currentEvaluationBinding(service:PortalService,binding:EvaluationBinding,actorId:string){return !!await one(service.db,"SELECT p.id FROM projects p JOIN teams t ON t.id=p.team_id JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id WHERE p.id=? AND p.published_version_id=? AND t.leader_id=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='project' AND r.target_id=p.id) OR (r.kind='submission' AND r.target_id=p.published_version_id) OR (r.kind='team' AND r.target_id=t.id) OR (r.kind='participant' AND r.target_id=?)))",binding.projectId,binding.versionId,actorId,actorId)}
/** Internal engine. HTTP callers must authorize staff or the exact active leader/version first. */
export async function runEvaluationJob(service:PortalService,actorId:string,jobId:string,action='astra-run',options:{binding?:EvaluationBinding;prepare?:(value:EvaluationPreparation)=>Promise<'continue'|'ineligible'>;source?:string}={}){
        await service.unfrozen();
        const j = await one<{
          id: string;
          version_id: string;
          state: string;
          attempts: number;
          payload: string;
          project_id: string | null;
        }>(
          service.db,
          "SELECT j.*,v.payload,p.id project_id FROM astra_jobs j JOIN submission_versions v ON v.id=j.version_id LEFT JOIN projects p ON p.team_id=v.team_id WHERE j.id=?",
          jobId,
        );
        demand(
          j &&
            ["pending", "failed_retryable", "needs_review"].includes(j.state) &&
            j.attempts < 3,
          409,
          "JOB_NOT_RUNNABLE",
        );
        if(options.binding)demand(j.project_id===options.binding.projectId&&j.version_id===options.binding.versionId&&await currentEvaluationBinding(service,options.binding,actorId),409,"JOB_SUPERSEDED");
        const claimedAt = service.now();
        const runId = crypto.randomUUID();
        const configKey = (service.evaluator.configuration || "offline-verification-v1") + ":" + j.id;
        const claim = await batch(service.db, [
          [
            "UPDATE astra_jobs SET state='running',attempts=attempts+1,updated_at=? WHERE id=? AND state=? AND attempts=? AND NOT EXISTS(SELECT 1 FROM result_snapshots)"+(options.binding ? " AND EXISTS(SELECT 1 FROM projects p WHERE p.id=? AND p.published_version_id=?) AND (SELECT count(*) FROM astra_jobs WHERE state='running')<4" : ""),
            claimedAt,
            j.id,
            j.state,
            j.attempts,
            ...(options.binding?[options.binding.projectId,options.binding.versionId]:[]),
          ],
          ...assertPreviousWrite(),
          ...(j.project_id
            ? [
                [
                  "INSERT INTO evaluation_runs(id,project_id,version_id,config_key,state,score,provenance,created_at,updated_at) VALUES(?,?,?,?,'running',NULL,?,?,?)",
                  runId,
                  j.project_id,
                  j.version_id,
                  configKey,
                  service.evaluator.provenance || "offline",
                  claimedAt,
                  claimedAt,
                ] as SQL,
              ]
            : []),
        ]);
        demand(claim[0].meta?.changes === 1, 409, "JOB_ALREADY_CLAIMED");
        try {
          const payload = JSON.parse(j.payload);
          if(options.prepare&&j.project_id){const prepared=await options.prepare({projectId:j.project_id,versionId:j.version_id,payload,runId});if(prepared==='ineligible'){
            await service.unfrozen();await service.mutate(actorId,action,j.id,[["UPDATE astra_jobs SET state='finalized',report=NULL,error=NULL,updated_at=? WHERE id=? AND state='running' AND attempts=? AND updated_at=?",service.now(),j.id,j.attempts+1,claimedAt],...assertPreviousWrite(),["UPDATE evaluation_runs SET state='completed',score=NULL,provenance='offline',error=NULL,updated_at=? WHERE id=? AND state='running'",service.now(),runId]],{state:'repository_ineligible',source:options.source||'automatic'});return {message:'Repository timing is ineligible. No AI evaluation was requested.'};}}
          if(options.binding)demand(await currentEvaluationBinding(service,options.binding,actorId),409,"JOB_SUPERSEDED");
          const repository = j.project_id
            ? await one<{ commit_sha: string }>(
                service.db,
                "SELECT commit_sha FROM repository_evidence WHERE project_id=? AND version_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
                j.project_id,
                j.version_id,
              )
            : undefined;
          // Participant payload remains immutable; a separately recorded staff
          // observation can bind an offline snapshot to this exact version.
          const report = reportSchema.parse(
            await service.evaluator.evaluate(
              j.version_id,
              repository
                ? { ...payload, commitSha: repository.commit_sha }
                : payload,
            ),
          );
          demand(
            report.versionId === j.version_id,
            422,
            "REPORT_VERSION_MISMATCH",
          );
          const grade = validatedProviderGrade(
            report,
            service.evaluator.provenance,
            repository?.commit_sha || (typeof payload.commitSha === "string" ? payload.commitSha.toLowerCase() : ""),
          );
          const storedReport = storedEvaluationReport(report, grade);
          if(options.binding&&!await currentEvaluationBinding(service,options.binding,actorId)){
            if(!await one(service.db,'SELECT id FROM result_snapshots LIMIT 1'))await batch(service.db,[["UPDATE evaluation_runs SET state='stale',score=NULL,updated_at=? WHERE id=? AND state='running'",service.now(),runId],["UPDATE astra_jobs SET state='needs_review',error='Superseded submission',updated_at=? WHERE id=? AND state='running' AND attempts=? AND updated_at=?",service.now(),j.id,j.attempts+1,claimedAt]]);
            return {message:'Evaluation belongs to a superseded submission. Current project is unchanged.'};
          }
          if (await one(service.db, "SELECT id FROM result_snapshots LIMIT 1"))
            return { message: "Evaluation stopped; final scores are frozen." };
          const completionGuard = "evaluation-completion:" + runId;
          const boundGuard="evaluation-version:"+runId;
          const bindingStatements:SQL[]=options.binding?[["INSERT INTO write_guards SELECT ?,1 FROM projects p JOIN teams t ON t.id=p.team_id JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id WHERE p.id=? AND p.published_version_id=? AND t.leader_id=? AND NOT EXISTS(SELECT 1 FROM result_snapshots) AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='project' AND r.target_id=p.id) OR (r.kind='submission' AND r.target_id=p.published_version_id) OR (r.kind='team' AND r.target_id=t.id)))",boundGuard,options.binding.projectId,options.binding.versionId,actorId],...assertPreviousWrite(),["DELETE FROM write_guards WHERE token=?",boundGuard]]:[];
          await service.mutate(
            actorId,
            action,
            j.id,
            [
              ...bindingStatements,
              ["INSERT INTO write_guards VALUES(?,CASE WHEN NOT EXISTS(SELECT 1 FROM result_snapshots) THEN 1 ELSE 0 END)", completionGuard,
              ],
              [
                "UPDATE astra_jobs SET state=?,report=?,error=NULL,updated_at=? WHERE id=? AND state='running' AND attempts=? AND updated_at=?",
                grade === null ? "needs_review" : "finalized",
                JSON.stringify(storedReport),
                service.now(),
                j.id,
                j.attempts + 1,
                claimedAt,
              ],
              ...assertPreviousWrite(),
              ...(j.project_id
                ? [
                    [
                      "UPDATE evaluation_runs SET state='completed',report=?,score=?,updated_at=? WHERE id=? AND state='running'",
                      JSON.stringify(storedReport),
                      grade,
                      service.now(),
                      runId,
                    ] as SQL,
                  ]
                : []),
              ["DELETE FROM write_guards WHERE token=?", completionGuard],
            ],
            { state: grade === null ? "needs_review" : "finalized", scored: grade !== null,source:options.source||'staff', 
            },
          );
          return {
            message:
              grade === null ? "AI report needs review." : "AI score saved.",
          };
        } catch (error) {
          const repositoryFailure=repositoryReadFailure(error);
          const failureMessage=repositoryFailure?JSON.stringify(repositoryFailure):"Evaluation unavailable or invalid output";
          if (await one(service.db, "SELECT id FROM result_snapshots LIMIT 1"))
            return { message: "Evaluation stopped; final scores are frozen." };
          const lease = await one<{
            state: string;
            attempts: number;
            updated_at: string;
          }>(
            service.db,
            "SELECT state,attempts,updated_at FROM astra_jobs WHERE id=?",
            j.id,
          );
          if (
            !lease ||
            lease.state !== "running" ||
            lease.attempts !== j.attempts + 1 ||
            lease.updated_at !== claimedAt
          )
            return {
              message: "Verification was superseded by another staff action.",
            };
          await service.mutate(
            actorId,
            action,
            j.id,
            [
              [
                "UPDATE astra_jobs SET state='failed_retryable',error=?,updated_at=? WHERE id=? AND state='running' AND attempts=? AND updated_at=?",
                failureMessage,service.now(),
                j.id,
                j.attempts + 1,
                claimedAt,
              ],
              ...assertPreviousWrite(),
              ...(j.project_id
                ? [
                    [
                      "UPDATE evaluation_runs SET state='failed',error=?,updated_at=? WHERE id=? AND state='running'",
                      failureMessage,service.now(),
                      runId,
                    ] as SQL,
                  ]
                : []),
            ],
            { state: "failed_retryable" },
          );
          return {
            message:
              "Evaluation unavailable. Submission preserved; retry or use approved fallback.",
          };
        }

}
