import test from 'node:test';import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import DashboardSubmissionStatus,{submissionNotice} from '../app/dashboard-submission-status';
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
