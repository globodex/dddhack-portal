import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const origin='http://localhost:3012',out='evidence/unified-navigation/after';
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),syntheticOnly:true,checks:[]};
const previous=JSON.parse(readFileSync(out+'/top-link-before-fix.json','utf8'));report.checks.push(...previous.checks);report.priorCheckSource=previous.source;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
async function setup(actor,path,allowSignout=false){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
 if(actor!=='anonymous')await context.addCookies([{name:'portal_local_fixture',value:actor,url:origin}]);
 const requests=[];const errors=[];
 await context.route('**/*',route=>{const request=route.request();if(new URL(request.url()).origin!==origin)return route.abort('blockedbyclient');if(!['GET','HEAD'].includes(request.method())){let action;try{action=request.postDataJSON()?.action;}catch{}if(!allowSignout||action!=='local-signout')return route.abort('blockedbyclient');}return route.continue();});
 const page=await context.newPage();page.on('request',q=>requests.push({url:q.url(),method:q.method(),action:q.method()==='POST'?q.postDataJSON()?.action:undefined}));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>!document.querySelector('.navigation-toggle')?.disabled);await page.evaluate(()=>document.fonts.ready);
 return{context,page,requests,errors};
}
async function menu(page){await page.getByRole('button',{name:'Open navigation',exact:true}).tap();const dialog=page.getByRole('dialog',{name:'Navigation',exact:true});await dialog.waitFor({state:'visible'});await page.waitForFunction(()=>!!history.state?.portalDialog);return dialog;}
try{
 for(const[actor,path,label,destination]of[
  ['owner','/admin/participants','Workspace','/dashboard'],['admin','/admin/participants','Workspace','/dashboard'],['alice','/dashboard','Your profile','/profile'],['anonymous','/','Sign in','/signin'],['stranger','/dashboard','Projects','/projects'],['bob','/admin/participants','Workspace','/dashboard'],['judge','/dashboard','Assigned projects','/review'],['judge2','/dashboard','Assigned projects','/review'],['dave','/profile','Dashboard','/dashboard'],
 ]){
  if(report.checks.some(c=>c.actor===actor&&c.path===path))continue;
  const {context,page,requests,errors}=await setup(actor,path);report.inFlight={actor,path,label,destination,requests,errors};
  try{const dialog=await menu(page);const link=dialog.getByRole('link',{name:label,exact:true});assert.equal(new URL(await link.getAttribute('href'),origin).pathname,destination);await link.tap();await page.waitForURL(url=>url.pathname===destination,{timeout:15000});await page.waitForFunction(()=>!document.querySelector('.navigation-toggle')?.disabled);await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('.page-error-card').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const file=`${out}/first-tap-${actor}-${destination.slice(1)}-390.png`;await page.screenshot({path:file,animations:'disabled'});
   await page.goBack();await page.waitForURL(url=>url.pathname===path,{timeout:15000});assert.equal(errors.length,0);assert.equal(requests.some(r=>r.url.includes('/api/auth/session')),false);assert.equal(requests.some(r=>r.method==='POST'),false);report.checks.push({actor,name:'First touch '+label+' navigates once; one Back returns original route',path,destination,file,requests,errors});delete report.inFlight;
  }catch(e){report.inFlight.failure={message:e.message,stack:e.stack};report.inFlight.finalURL=page.url();report.inFlight.file=`${out}/first-tap-${actor}-FAIL.png`;await page.screenshot({path:report.inFlight.file,animations:'disabled'}).catch(e=>report.inFlight.screenshotError=e.message);throw e;}finally{await context.close();}
 }
 {
  const {context,page,requests,errors}=await setup('anonymous','/');const link=page.locator('.navigation-account');assert.equal(await link.getAttribute('target'),'_top');await link.tap();await page.waitForURL('**/signin?returnTo=%2Fdashboard');await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();assert.equal(errors.length,0);report.checks.push({name:'Anonymous header sign-in affordance preserves native top-frame navigation',requests});await context.close();
 }
 {
  const {context,page,requests,errors}=await setup('owner','/admin/participants');let dialog=await menu(page);const apiBefore=requests.filter(r=>r.url.includes('/api/portal')).length;await page.setViewportSize({width:1440,height:900});await dialog.waitFor({state:'visible'});assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).getAttribute('aria-expanded'),'true');const file=out+'/menu-persists-after-desktop-resize-1440.png';await page.screenshot({path:file,animations:'disabled'});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement===document.querySelector('.navigation-toggle'),null,{timeout:2000});assert.equal(requests.filter(r=>r.url.includes('/api/portal')).length,apiBefore);assert.equal(errors.length,0);report.checks.push({name:'Open touch menu survives resize to desktop; Escape restores focus; no extra view requests',file,requests});await context.close();
 }
 {
  const {context,page,requests,errors}=await setup('anonymous','/privacy');const dialog=await menu(page);await dialog.getByRole('link',{name:'Terms',exact:true}).tap();await page.waitForURL('**/terms');await page.getByRole('heading',{name:'Terms of participation',exact:true}).waitFor();await page.goBack();await page.waitForURL('**/privacy');assert.equal(errors.length,0);assert.equal(requests.some(r=>r.url.includes('/api/portal')||r.url.includes('/api/auth/session')),false);report.checks.push({name:'Standalone shared menu plain link first touch/Back works with no identity fetch',requests});await context.close();
 }
 {
  const {context,page,requests,errors}=await setup('alice','/dashboard',true);const dialog=await menu(page);const logout=dialog.getByRole('button',{name:'Log out',exact:true});await logout.scrollIntoViewIfNeeded();await logout.tap();const confirmation=page.locator('.confirmation-dialog[open]');await confirmation.waitFor({state:'visible'});const file=out+'/logout-existing-confirmation-390.png';await page.screenshot({path:file,animations:'disabled'});assert.equal(requests.some(r=>r.method==='POST'),false);const responseWaiter=page.waitForResponse(r=>r.url().includes('/api/portal')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='local-signout');await confirmation.getByRole('button',{name:'Log out',exact:true}).tap();const response=await responseWaiter;assert.equal(response.status(),200);await page.waitForURL(url=>url.pathname==='/');await page.locator('.navigation-account[data-avatar-state=anonymous]').waitFor();assert.equal(requests.filter(r=>r.action==='local-signout').length,1);assert.equal(errors.length,0);report.checks.push({name:'Red Log out opens existing confirmation; one confirmed synthetic signout200 returns anonymous Home',file,status:response.status(),requests});await context.close();
 }
 report.result='PASS';
}catch(e){report.result='FAIL';report.failure={message:e.message,stack:e.stack};throw e;}finally{await browser.close();report.browserClosed=true;writeFileSync(out+'/interactions-report.json',JSON.stringify(report,null,2));}
