"use client";
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import DotAvatar from './dot-avatar';
import type {SubmissionSuccessState} from '../lib/project-share';
const colors=['blue','orange','green','purple','charcoal','grey'];
const expressions=['squeezed','sleepy','plus','round','cheerful','star'];
/** A short decorative celebration, with no dialog, focus change or pointer interception. */
export default function ProjectSubmissionSuccess({value,onClose}:{value:SubmissionSuccessState;onClose:()=>void}){
 const close=useRef(onClose);close.current=onClose;const [animate,setAnimate]=useState(false);
 useEffect(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=false;try{paused=localStorage.getItem('portal-pause-motion')==='true'}catch{}
  setAnimate(!reduced.matches&&!paused);const stop=()=>setAnimate(false);const motion=()=>{if(reduced.matches)stop()};const hidden=()=>{if(document.visibilityState!=='visible'){stop();close.current()}};
  reduced.addEventListener('change',motion);document.addEventListener('visibilitychange',hidden);const timer=setTimeout(()=>close.current(),2800);
  return()=>{clearTimeout(timer);reduced.removeEventListener('change',motion);document.removeEventListener('visibilitychange',hidden)};
 },[value.attempt]);
 return <><p className="sr-only" role="status">Project submitted successfully. Submission {value.attempt} of 3.</p>{animate&&<div className="submission-celebration" aria-hidden="true">{Array.from({length:24},(_,index)=><span key={index} style={{left:`${(index*43)%100}%`,'--celebration-delay':`${(index%6)*80}ms`,'--celebration-drift':`${(index%2?1:-1)*(18+(index%4)*14)}px`,'--celebration-turn':`${(index%2?1:-1)*160}deg`} as CSSProperties}><DotAvatar decorative color={colors[index%colors.length]} expression={expressions[index%expressions.length]} size={18+(index%4)*5}/></span>)}</div>}</>;
}
