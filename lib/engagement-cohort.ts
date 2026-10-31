import {communityVotingWindow} from './community-window';
/** Frozen snapshots are immutable; this defines only fresh calculations. All upper bounds exclusive. */
export function engagementScoringCohort(policy:{submissionOpen?:unknown;submissionClose?:unknown},asOf:string,frozenAt:string|null=null){
 const window=communityVotingWindow(policy,asOf),now=Date.parse(asOf),freeze=frozenAt===null?Infinity:Date.parse(frozenAt);
 const configured=!!window.opensAt&&!!window.closesAt&&Number.isFinite(now)&&(freeze===Infinity||Number.isFinite(freeze));
 if(!configured)return {configured:false,votes:{start:NaN,end:NaN},feedback:{start:NaN,end:NaN}};
 const close=Date.parse(window.closesAt!),end=Math.min(now,freeze);
 return {configured:true,votes:{start:Date.parse(window.opensAt!),end:Math.min(close,end)},feedback:{start:close,end}};
}
export function inScoringCohort(value:string,window:{start:number;end:number}){const at=Date.parse(value);return Number.isFinite(at)&&at>=window.start&&at<window.end}
