import test from 'node:test';import assert from 'node:assert/strict';
import {communityVotingWindow} from '../lib/community-window';
import {portalNavigation} from '../lib/navigation';
const policy={submissionOpen:'2026-11-01T08:00:00+05:30',submissionClose:'2026-11-01T16:00:00+05:30'};
test('voting opens exactly at participant opening and closes exclusively at actual closing, in IST',()=>{
 for(const [time,allowed] of [['2026-11-01T02:29:59.999Z',false],['2026-11-01T02:30:00.000Z',true],['2026-11-01T10:29:59.999Z',true],['2026-11-01T10:30:00.000Z',false]] as const)assert.equal(communityVotingWindow(policy,time).allowed,allowed);
 assert.equal(communityVotingWindow({},'2026-11-01T06:00:00Z').allowed,false);assert.equal(communityVotingWindow(policy,'invalid').allowed,false);
});
test('current navigation calls public projects Showcase for anonymous/participants/admins while Submissions stays admin-only',()=>{
 for(const actor of [undefined,{role:'participant'},{role:'admin'},{owner:true}]){
  const items=portalNavigation(actor?.role==='admin'||actor?.owner?'/admin/teams':'/',actor).items;
  assert.ok(items.some(([href,label])=>href==='/projects'&&label==='Showcase'));
  if(!actor||!actor.owner&&actor.role!=='admin')assert.ok(!items.some(([href])=>href==='/admin/submissions'));
 }
});
