import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import AdminTeamActions from '../app/admin-team-actions';
import {confirmationFor,revealConfirmation} from '../lib/action-confirmation';
const team={id:'synthetic',name:'Synthetic admin target',members:[],locked:false};
test('admin Lock is distinct from display status, safely disabled before hydration and confirms exact fresh team identity',()=>{
 const html=renderToStaticMarkup(createElement(AdminTeamActions,{team,run:async()=>({})}));
 assert.match(html,/disabled=""[^>]*aria-busy="false"[^>]*>.*Lock team/s);
 assert.doesNotMatch(html,/Unlock team|name="idea"|name="profile"/);
 assert.deepEqual(confirmationFor('admin-lock-team',{expectedName:team.name},'fallback'),{title:'Lock team?',target:team.name,description:'Lock team and idea editing. Member approval stays unchanged.',confirmLabel:'Lock team',critical:true});
 assert.equal(revealConfirmation('admin-lock-team',{}),'ADMIN_LOCK_TEAM');
});
test('admin Lock fetches fresh preview once, prevents repeated requests and safely recovers from refusal, cancellation and mutation failure',{skip:!existsSync('/usr/bin/chromium')},async()=>{
 const built=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import AdminTeamActions from './app/admin-team-actions';import{ActionCancelled}from'./lib/action-confirmation';
 window.previewReads=0;window.calls=[];window.fetch=()=>{window.previewReads++;return new Promise(resolve=>window.previewReply=(status,body)=>resolve(new Response(JSON.stringify(body),{status})));};
 createRoot(document.getElementById('root')).render(React.createElement(AdminTeamActions,{team:${JSON.stringify(team)},run:(action,values)=>{window.calls.push({action,values});return new Promise((resolve,reject)=>{window.finish=resolve;window.fail=reject;window.cancel=()=>reject(new ActionCancelled());});}}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<div class="app-shell"><div id="root"></div></div>');await page.addStyleTag({content:readFileSync('app/style.css','utf8')+readFileSync('app/admin-experience.css','utf8')});await page.addScriptTag({content:built.outputFiles[0].text});
 const lock=page.getByRole('button',{name:'Lock team',exact:true});await lock.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Lock team'&&!b.disabled));
 await lock.tap();await page.waitForFunction(()=>(window as any).previewReads===1);await page.locator('button[aria-busy=true]').evaluate((button:HTMLButtonElement)=>button.click());assert.equal(await page.evaluate(()=>(window as any).previewReads),1);
 await page.evaluate(()=> (window as any).previewReply(200,{canLock:true,team:{id:'synthetic',name:'Fresh reviewed identity'},snapshotDigest:'a'.repeat(64)}));await page.waitForFunction(()=>(window as any).calls.length===1);
 const call=await page.evaluate(()=>(window as any).calls[0]);assert.deepEqual(call,{action:'admin-lock-team',values:{teamId:'synthetic',expectedName:'Fresh reviewed identity',snapshotDigest:'a'.repeat(64),confirmation:'ADMIN_LOCK_TEAM'}});
 await page.evaluate(()=>(window as any).fail(new Error('Team changed. Review again.')));await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Team changed/);assert.equal(await lock.isEnabled(),true);
 await lock.tap();await page.evaluate(()=>(window as any).previewReply(403,{code:'ADMIN_REQUIRED',message:'Admin access required.'}));await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>(window as any).calls.length),1);
 await lock.tap();await page.evaluate(()=>(window as any).previewReply(200,{canLock:true,team:{id:'synthetic',name:'Fresh reviewed identity'},snapshotDigest:'b'.repeat(64)}));await page.waitForFunction(()=>(window as any).calls.length===2);await page.evaluate(()=>(window as any).cancel());await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Lock team'&&!b.disabled));assert.equal(await page.getByRole('alert').count(),0);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
