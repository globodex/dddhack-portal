/** Voting uses the actual participant submission window for every role. */
export function communityVotingWindow(policy: {submissionOpen?: unknown; submissionClose?: unknown}, now: string) {
  const open=typeof policy.submissionOpen==='string'?Date.parse(policy.submissionOpen):NaN;
  const close=typeof policy.submissionClose==='string'?Date.parse(policy.submissionClose):NaN;
  const current=Date.parse(now),configured=Number.isFinite(open)&&Number.isFinite(close)&&close>open;
  const state=!configured||!Number.isFinite(current)?'unavailable':current<open?'scheduled':current>=close?'closed':'open';
  return {allowed:state==='open',state,opensAt:configured?new Date(open).toISOString():null,closesAt:configured?new Date(close).toISOString():null,serverNow:now,message:state==='open'?'Voting is open.':state==='scheduled'?'Voting opens with submissions.':state==='closed'?'Voting closed when submissions ended.':'Voting availability is not configured.'};
}
