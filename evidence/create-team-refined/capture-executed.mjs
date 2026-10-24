import assert from 'node:assert/strict';
import {chromium} from '/workspace/dddhack-portal/node_modules/@playwright/test/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const origin='http://localhost:3000',out='/workspace/dddhack-portal/evidence/create-team-refined';mkdirSync(out,{recursive:true});
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:'/workspace/dddhack-portal',encoding:'utf8'}).trim();
const report={source,syntheticOnly:true,writes:[],errors:[],blocked:[],screenshots:[]};
const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
try {for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:390,height:480},{width:320,height:480}]) {
 const c=await b.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width===390,isMobile:viewport.width===390});
 await c.addCookies([{name:'portal_local_fixture',value:'pending',url:origin,httpOnly:true,sameSite:'Strict'}]);
 await c.route('**/*',r=>{const q=r.request();if(new URL(q.url()).origin!==origin||!['GET','HEAD'].includes(q.method())){report.blocked.push({method:q.method(),url:q.url()});return r.abort();}return r.continue();});
 const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(origin+'/discover/teams',{waitUntil:'networkidle'});await p.locator('.app-shell[data-hydrated="true"]').waitFor();
 await p.getByRole('button',{name:'Create team',exact:true}).click();const dialog=p.locator('.team-create-dialog[open]');await dialog.locator('form[data-hydrated="true"]').waitFor();
 await dialog.locator('input[name="name"]').fill('Silver Line');await dialog.locator('label[title="Purple"]').click();await dialog.locator('h2').click();await p.mouse.move(0,0);
 await p.evaluate(()=>document.fonts.ready);assert.equal(await dialog.getByRole('radio').count(),8);assert.equal(await dialog.getByRole('radio',{name:'Purple',exact:true}).isChecked(),true);
 const file=`create-team-${viewport.width}x${viewport.height}.png`;await p.screenshot({path:out+'/'+file,caret:'initial',animations:'disabled',style:'nextjs-portal { visibility:hidden !important; }'});report.screenshots.push({file,viewport,source});
 if(viewport.height===480){await dialog.locator('textarea[name="bio"]').focus();await p.screenshot({path:out+`/create-team-${viewport.width}x${viewport.height}-intro-focused.png`,caret:'initial',animations:'disabled',style:'nextjs-portal { visibility:hidden !important; }'});report.screenshots.push({file:`create-team-${viewport.width}x${viewport.height}-intro-focused.png`,viewport,source});}
 await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'});await c.close();
}}finally {await b.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));assert.equal(report.errors.length,0);assert.equal(report.blocked.length,0);
