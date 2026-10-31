import test from 'node:test';import assert from 'node:assert/strict';import {githubEligibility} from '../lib/evaluation';
const cutoff='2026-11-01T08:00:00+05:30';
test('only evidenced pre-event repository/first-commit dates reject; equality is not old',()=>{
 assert.equal(githubEligibility({public:true,createdAt:cutoff,firstCommit:cutoff}),'ELIGIBLE');
 assert.equal(githubEligibility({public:true,createdAt:'2026-11-01T07:59:59+05:30',firstCommit:null}),'INELIGIBLE');
 assert.equal(githubEligibility({public:true,createdAt:cutoff,firstCommit:'2026-11-01T02:29:59Z'}),'INELIGIBLE');
 for(const input of [null,{public:false,createdAt:cutoff,firstCommit:cutoff},{public:true,createdAt:cutoff,firstCommit:null},{public:true,createdAt:'invalid',firstCommit:cutoff}])assert.equal(githubEligibility(input),'NEEDS_MANUAL_REVIEW');
});
