import type {PortalService} from './service';
import {one} from './db';
import {scoreState} from './score-release';
import {ownerScoreReveal} from './owner-score-reveal';
export async function resultControls(s:PortalService){
 const actor=await s.staff(),state=await scoreState(s),deny=(reason:string)=>({allowed:false,reason}),yes={allowed:true,reason:''};
 let reveal=state.stage==='final'?deny('Scores have already been revealed.'):!actor.owner?deny('Owner required.'):yes;
 if(reveal.allowed){try{await ownerScoreReveal(s,'preview-reveal-scores',{})}catch(error){const code=(error as {code?:string}).code;reveal=deny(code==='TIE_REQUIRES_OWNER_RESOLUTION'?'Resolve tied scores before reveal.':code==='POLICIES_UNCONFIRMED'?'Complete scoring configuration.':code==='SCORING_DISCLOSURE_UNCONFIRMED'?'Confirm scoring criteria and weightage.':'Complete current-version eligibility, score assessments and judge coverage.')}}
 const frozen=!!await one(s.db,'SELECT id FROM result_snapshots LIMIT 1');
 return {reveal,final:reveal,freeze:!actor.owner?deny('Owner required.'):frozen?deny('Scores are already locked.'):reveal,ai:deny('AI and total scores are revealed together by the owner.')};
}
