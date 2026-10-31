import test from 'node:test';import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {Projects} from '../app/portal';
const project={id:'synthetic-project',slug:'synthetic-project',projectName:'Synthetic Weather',problemSolution:'A clearer forecast for every journey.',teamName:'Synthetic Builders',logo:'/logo.svg',banner:'/banner.webp',upvotes:7,comments:2};
const render=(result?:unknown)=>renderToStaticMarkup(createElement(Projects,{path:'/projects',run:async()=>({}),data:{items:[{...project,result}],scoreStage:result?'final':'community'}}));
test('Showcase cards show banner, logo, one-liner and direct actions, without listing breakdown/accordion',()=>{
 const html=render();assert.match(html,/showcase-card-banner/);assert.match(html,/row-logo/);assert.match(html,/A clearer forecast/);assert.match(html,/>View Project</);assert.match(html,/Share/);assert.match(html,/Hidden until the owner reveals scores/);assert.doesNotMatch(html,/<details|<summary|Human score|AI score/);
});
test('Showcase card masks former AI-only stage and shows only released final total',()=>{
 const hidden=render({stage:'ai',score:27.193845});assert.doesNotMatch(hidden,/27\.193845/);assert.match(hidden,/Hidden until/);
 const visible=render({stage:'final',score:94.25});assert.match(visible,/94\.25/);assert.match(visible,/Total score/);assert.doesNotMatch(visible,/Human score|AI score|<details/);
});
