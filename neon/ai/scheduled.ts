import {storedRepositoryReadFailure} from '../../lib/repository-read-error';
import {z} from 'zod';
import {one,rows,batch} from '../../lib/db';
import {sha256} from '../../lib/security';
import {OWNER_EMAIL} from '../../lib/identity';
import type {PortalService} from '../../lib/service';
import {processAutomaticEvaluation} from './automatic';
export type AutomaticScheduleEnv={PORTAL_EVALUATION_TRIGGER_ID?:string;PORTAL_OPENAI_EVALUATION_APPROVED?:string;PORTAL_GITHUB_PUBLIC_READ_TOKEN?:string};
const headers={'Cache-Control':'private, no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
/** NEON API ENTRYPOINT ONLY: Neon strips client-set X-Neon-* headers at ingress.
 * This function must not be installed on an arbitrary public HTTP server that lacks that guarantee. */
export async function handleAutomaticSchedule(request:Request,env:AutomaticScheduleEnv,serviceFor:()=>Promise<PortalService>,fetcher:typeof fetch):Promise<Response|null>{
 if(new URL(request.url).pathname!=='/api/evaluation/automatic-tick')return null;
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(request.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
 const invocation=request.headers.get('x-neon-trigger-invocation-id');
 if(!invocation||!env.PORTAL_EVALUATION_TRIGGER_ID||env.PORTAL_OPENAI_EVALUATION_APPROVED!=='true')return reply({code:'AUTOMATIC_TRIGGER_NOT_AUTHORIZED'},403);
 try{
  const reader=request.body?.getReader();if(!reader)return reply({code:'TRIGGER_PAYLOAD_INVALID'},422);let total=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>8192){await reader.cancel();return reply({code:'TRIGGER_BODY_TOO_LARGE'},413)}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({code:'TRIGGER_PAYLOAD_INVALID'},422)}
  const parsed=z.object({version:z.literal(1),invocation_id:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),trigger:z.object({type:z.literal('schedule'),id:z.string().min(1).max(200)}),data:z.object({scheduled_at:z.string().datetime({offset:true})})}).safeParse(raw);if(!parsed.success)return reply({code:'TRIGGER_PAYLOAD_INVALID'},422);const value=parsed.data;
  if(invocation!==value.invocation_id||value.trigger.id!==env.PORTAL_EVALUATION_TRIGGER_ID)return reply({code:'AUTOMATIC_TRIGGER_NOT_AUTHORIZED'},403);
  const service=await serviceFor();if(service.evaluator.provenance!=='provider'||service.evaluator.available===false)return reply({processed:0,configured:false});
  if(await one(service.db,'SELECT id FROM result_snapshots LIMIT 1'))return reply({processed:0,locked:true});
  const owner=await one<{id:string}>(service.db,"SELECT u.id FROM users u WHERE lower(u.email)=? AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1)",OWNER_EMAIL.toLowerCase());if(!owner)return reply({code:'OWNER_SETUP_REQUIRED'},409);
  const receipt='automatic-trigger:'+await sha256(JSON.stringify([value.trigger.id,value.data.scheduled_at]));
  const inserted=await batch(service.db,[["INSERT INTO audit_logs(id,actor_id,action,entity_id,detail,reason,created_at) VALUES(?,?,'automatic-evaluation-trigger',?,?,?,?) ON CONFLICT(id) DO NOTHING",receipt,owner.id,value.trigger.id,JSON.stringify({source:'neon-schedule',invocationId:value.invocation_id,scheduledAt:value.data.scheduled_at}),'Owner-configured scheduled evaluation processing',service.now()]]);
  if(inserted[0].meta?.changes!==1)return reply({processed:0,duplicate:true});
  const pending=await rows<{project_id:string;version_id:string;leader_id:string;state:string;attempts:number;updated_at:string;error:string|null}>(service.db,"SELECT p.id project_id,p.published_version_id version_id,t.leader_id,j.state,j.attempts,j.updated_at,j.error FROM astra_jobs j JOIN projects p ON p.published_version_id=j.version_id JOIN teams t ON t.id=p.team_id JOIN memberships m ON m.team_id=t.id AND m.user_id=t.leader_id WHERE j.state IN ('pending','failed_retryable','needs_review','running') AND (j.attempts<3 OR j.state='running') AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='project' AND r.target_id=p.id) OR (r.kind='submission' AND r.target_id=p.published_version_id) OR (r.kind='team' AND r.target_id=t.id) OR (r.kind='participant' AND r.target_id=t.leader_id))) ORDER BY j.updated_at,j.id LIMIT 24");
  let processed=0;for(const item of pending){const failure=storedRepositoryReadFailure(item.error);if(failure?.retryAt&&Date.parse(failure.retryAt)>Date.parse(service.now()))continue;const elapsed=Date.parse(service.now())-Date.parse(item.updated_at);if(item.state==='running'?elapsed<=900_000:item.state!=='pending'&&elapsed<60_000*Math.pow(2,Math.max(0,item.attempts-1)))continue;
   processed++;try{await processAutomaticEvaluation(service,item.leader_id,{projectId:item.project_id,versionId:item.version_id},fetcher,'scheduled',env.PORTAL_GITHUB_PUBLIC_READ_TOKEN)}catch{}if(processed>=3)break;
  }
  console.info("automatic-evaluation-tick",{invocationId:value.invocation_id,processed});
  return reply({processed});
 }catch{return reply({code:'AUTOMATIC_TRIGGER_FAILED'},503)}
}
