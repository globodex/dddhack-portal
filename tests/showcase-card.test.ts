import test from 'node:test';import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {Projects} from '../app/portal';
const project={id:'synthetic-project',slug:'synthetic-project',projectName:'Synthetic Weather',problemSolution:'A clearer forecast for every journey.',teamName:'Synthetic Builders',logo:'/logo.svg',banner:'/banner.webp',upvotes:7,comments:2};
const render=(result?:unknown)=>renderToStaticMarkup(createElement(Projects,{path:'/projects',run:async()=>({}),data:{items:[{...project,result}],scoreStage:result?'final':'community',scoringInfo:{criteria:'Synthetic rubric',weightage:'Synthetic weights'}}}));
test('Showcase cards show banner, logo, one-liner and direct actions, without listing breakdown/accordion',()=>{
 const html=render();assert.match(html,/showcase-card-banner/);assert.match(html,/row-logo/);assert.match(html,/A clearer forecast/);assert.match(html,/>View Project</);assert.match(html,/Share/);assert.doesNotMatch(html,/Hidden until|showcase-card-score|Project score/);assert.doesNotMatch(html,/<details|<summary|Human score|AI score/);
});
test('Showcase card masks former AI-only stage and shows only released final total',()=>{
 const hidden=render({stage:'ai',score:27.193845});assert.doesNotMatch(hidden,/27\.193845/);assert.doesNotMatch(hidden,/Hidden until|showcase-card-score/);
 const visible=render({stage:'final',score:94.25});assert.match(visible,/94\.25/);assert.match(visible,/Total score/);assert.doesNotMatch(visible,/Human score|AI score|<details/);
});

test('released rank badges follow canonical positions, never list ordering, and do not rank missing/invalid results',()=>{const positions=[8,1,11,3,2,0,-1,1.5];const html=renderToStaticMarkup(createElement(Projects,{path:'/projects',run:async()=>({}),data:{items:positions.map((position,index)=>({...project,id:String(index),slug:String(index),result:{stage:'final',score:80,position}})),scoreStage:'final'}}));assert.match(html,/Rank 8 · Top 10/);for(const label of ['1st place','2nd place','3rd place'])assert.match(html,new RegExp(label));assert.equal((html.match(/showcase-rank-badge/g)||[]).length,4);assert.equal((html.match(/showcase-podium /g)||[]).length,3);assert.doesNotMatch(html,/Rank 11|Rank 0|Rank -1|Rank 1\.5/)});
test('public detail omits all score UI before owner reveal',()=>{const html=renderToStaticMarkup(createElement(Projects,{path:'/projects/synthetic-project',run:async()=>({}),data:{project,comments:[],teamMembers:[],scoreStage:'community'}}));assert.doesNotMatch(html,/Score hidden|Hidden until|Project score|Total score|Judge score/)});
