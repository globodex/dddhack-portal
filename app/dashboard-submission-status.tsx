"use client";
import {useEffect,useState,type CSSProperties} from 'react';
import {Clock3} from 'lucide-react';
import {communityVotingWindow} from '../lib/community-window';
import {ist} from '../lib/time';
type Access={opensAt?:string|null;closesAt?:string|null;serverNow?:string};
export function submissionUrgency(remaining:number|null){
 if(remaining===null||remaining<=0||remaining>3600_000)return null;
 const minutes=remaining/60_000;
 const step=Math.min(8,Math.floor((60-minutes)/6));
 const hue=minutes>10?48-18*step/8:30*minutes/10;
 return {phase:minutes<=10?'final':'closing',step,hue};
}
export function submissionNotice(access:Access,elapsed=0){
 const start=Date.parse(access.serverNow||''),now=Number.isFinite(start)?new Date(start+Math.max(0,Number.isFinite(elapsed)?elapsed:0)).toISOString():'';
 const window=communityVotingWindow({submissionOpen:access.opensAt,submissionClose:access.closesAt},now);
 const remaining=window.state==='open'?Date.parse(window.closesAt!)-Date.parse(now):null;
 const seconds=remaining!==null&&remaining<=3600_000?Math.max(0,Math.ceil(remaining/1000)):null;
 return {...window,urgency:submissionUrgency(remaining),countdown:seconds===null?null:`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`};
}
export default function DashboardSubmissionStatus({access,compact=false}:{access?:Access;compact?:boolean}){
 const source=access?.serverNow||'', [clock,setClock]=useState({source,elapsed:0});
 useEffect(()=>{
  const anchor=performance.now();setClock({source,elapsed:0});
  const tick=()=>setClock({source,elapsed:performance.now()-anchor});
  const visible=()=>{if(document.visibilityState==='visible'){tick();window.dispatchEvent(new Event('portal-submission-refresh'));}};
  const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible)};
 },[source]);
 if(!source)return null;
 const notice=submissionNotice(access!,clock.source===source?clock.elapsed:0);
 return <section className={`dashboard-submission-status${compact?' is-compact':''}`} aria-label="Submission window status" data-urgency={notice.urgency?.phase} style={notice.urgency?{"--submission-urgency-hue":notice.urgency.hue} as CSSProperties:undefined}>
  <Clock3 size={24} aria-hidden="true"/>
  <div><h3>{notice.state==='open'?(notice.urgency?.phase==='final'?'Last 10 minutes':'Submissions have started'):notice.state==='closed'?'Submissions closed':notice.state==='scheduled'?'Your project is next':'Submission schedule'}</h3>
   <p>{notice.state==='open'?`Open until ${ist(notice.closesAt!)}.`:notice.state==='scheduled'?`Opens ${ist(notice.opensAt!)}. We look forward to your project.`:notice.state==='closed'?'Your committed submissions are preserved.':'The owner will publish the submission window here.'}</p>
  </div>
  {notice.countdown!==null&&<div className="dashboard-submission-countdown" role="timer" aria-label="Submission time remaining"><strong>{notice.countdown}</strong><span>minutes : seconds left</span></div>}
 </section>;
}
