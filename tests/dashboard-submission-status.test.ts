import test from 'node:test';import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import DashboardSubmissionStatus,{submissionNotice,submissionUrgency} from '../app/dashboard-submission-status';
const access={opensAt:'2026-11-01T02:30:00Z',closesAt:'2026-11-01T10:30:00Z',serverNow:'2026-11-01T09:30:00Z'};
test('dashboard final-hour countdown uses server time and switches exactly at closing',()=>{
 assert.equal(submissionNotice(access).countdown,'60:00');assert.equal(submissionNotice(access,1000).countdown,'59:59');assert.equal(submissionNotice(access,3599_001).countdown,'00:01');assert.equal(submissionNotice(access,3600_000).state,'closed');
 assert.equal(submissionNotice({...access,serverNow:'2026-11-01T08:00:00Z'}).countdown,null);
 assert.equal(submissionNotice({...access,serverNow:'2026-10-31T08:00:00Z'}).state,'scheduled');
 const html=renderToStaticMarkup(createElement(DashboardSubmissionStatus,{access}));assert.match(html,/role="timer"/);assert.match(html,/60:00/);assert.doesNotMatch(html,/aria-live="polite"|score/i);
 assert.equal(renderToStaticMarkup(createElement(DashboardSubmissionStatus,{})),'');
});

// The window card belongs to the persistent shell, outside all tab panels.
import {Dashboard} from '../app/portal';
test('one shared submission card remains outside Team, Credits and Project panels',()=>{
 for(const initialTab of ['team','credits','project'] as const){
  const html=renderToStaticMarkup(createElement(Dashboard,{initialTab,run:async()=>({}),data:{me:{id:'synthetic',name:'Synthetic',email:'synthetic@example.invalid',role:'participant',owner:false,mode:'participant',canParticipate:true},members:[],submissionAccess:access}}));
  assert.equal((html.match(/aria-label="Submission window status"/g)||[]).length,1);
  assert.ok(html.indexOf('aria-label="Submission window status"')<html.indexOf('id="team"'));
  assert.match(html,/60:00/);
 }
});

test('urgency advances every six minutes, joins orange continuously at ten, and ends exactly at close',()=>{let last=100;for(const minutes of [60,54,48,42,36,30,24,18,12,10,6,1]){const u=submissionUrgency(minutes*60_000)!;assert.ok(u.hue<=last);last=u.hue;assert.equal(u.phase,minutes<=10?'final':'closing')}assert.equal(submissionUrgency(60*60_000)?.hue,48);assert.equal(submissionUrgency(54*60_000)?.step,1);assert.equal(submissionUrgency(12*60_000)?.hue,30);assert.equal(submissionUrgency(10*60_000)?.hue,30);assert.equal(submissionUrgency(6*60_000)?.hue,18);assert.equal(submissionUrgency(0),null);assert.equal(submissionUrgency(3600_001),null);assert.equal(submissionUrgency(null),null);assert.ok(Math.abs(submissionUrgency(600_001)!.hue-submissionUrgency(600_000)!.hue)<.001);const equivalent={...access,closesAt:'2026-11-01T16:00:00+05:30',serverNow:'2026-11-01T15:00:00+05:30'};assert.deepEqual(submissionNotice(access).urgency,submissionNotice(equivalent).urgency);assert.equal(submissionNotice(access,3600_000).urgency,null)});
