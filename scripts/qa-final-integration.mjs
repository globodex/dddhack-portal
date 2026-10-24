// Read-only final composition audit. Disposable local fixtures only.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output = resolve(process.env.QA_OUTPUT || 'evidence/final-integration');
const surfaces = process.env.QA_SURFACES?.split(',');
mkdirSync(output,{recursive:true});
const source = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report = {source, syntheticOnly:true, physicalDevice:false, writes:[], blocked:[], screenshots:[], checks:[], accessibility:[], errors:[], limitations:['Local development Chromium, reduced motion and emulated touch. Timing excluded while the full test suite runs.','Next development overlay hidden in captures; application layout/content are unchanged.']};
const save=()=>writeFileSync(output+'/report.json',JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:false,headless:true});
try {
for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:390,height:480}]) {
 const mobile=viewport.width<500;
 for(const [name,path,actor] of [['participants','/admin/participants','owner'],['teams','/admin/teams','owner'],['submissions','/admin/submissions','owner'],['review','/admin/submissions/synthetic-alice','owner'],['credits','/admin/credits','owner'],['settings','/admin/settings','owner'],['logs','/admin/logs','owner'],['rules','/rules','alice'],['projects','/projects','alice'],['project','/projects/synthetic-alice','alice'],['leaderboard','/leaderboard','alice']]) {
  if (surfaces && !surfaces.includes(name)) continue;
  const context=await browser.newContext({viewport,reducedMotion:'reduce',isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  await context.addCookies([{name:'portal_local_fixture',value:actor,url:origin,httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/*',route=>{ const r=route.request(); if(new URL(r.url()).origin!==origin || !['GET','HEAD'].includes(r.method())) { report.blocked.push({name,method:r.method(),url:r.url()}); return route.abort('blockedbyclient'); } return route.continue(); });
  const page=await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror',e=>{ report.errors.push({name,viewport,error:e.message});save(); });
  try {
   const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:60000});
   assert.equal(response.status(),200,name+' HTTP');
   await page.locator('.app-shell[data-hydrated="true"]').waitFor();
   await page.waitForLoadState('networkidle'); await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
   const shot=async suffix=> { const file=`${name}${suffix}-${viewport.width}x${viewport.height}.png`; await page.screenshot({path:output+'/'+file,animations:'disabled',caret:'initial',style:'nextjs-portal { visibility:hidden !important; }'}); report.screenshots.push({name,path,viewport,file,source});save(); };
   await shot('');
   if(name==='submissions') {
    const summary=page.locator('.admin-submission-management > summary').first();
    await summary.click(); await summary.scrollIntoViewIfNeeded();
    const geometry=await summary.evaluate(el=>{ const box=el.getBoundingClientRect(), style=getComputedStyle(el), parent=el.parentElement.getBoundingClientRect();return {insetLeft:parseFloat(style.paddingLeft),insetRight:parseFloat(style.paddingRight),height:box.height,parentWidth:parent.width}; });
    assert.ok(geometry.insetLeft>=19&&geometry.insetRight>=19&&geometry.height>=52);
    report.checks.push({name:'Submission management aligned disclosure',viewport,geometry,passed:true});
    await shot('-expanded');
   }
   if(name==='settings') {
    for(const tab of ['Results','Access','Content']) { await page.getByRole('tab',{name:tab,exact:true}).click(); await shot('-'+tab.toLowerCase()); }
   }
   if(viewport.width===390&&viewport.height===844&&['review','credits','settings','logs','rules'].includes(name)) {
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    report.accessibility.push({name,violations:axe.violations});save();
   }
   report.checks.push({name,viewport,httpStatus:response.status(),h1:await page.locator('h1').allTextContents(),passed:true});
  } catch(error) { report.errors.push({name,viewport,error:String(error)});save(); }
  await context.close();
 }
}
} finally { await browser.close();save(); }
console.log(JSON.stringify({source,screenshots:report.screenshots.length,checks:report.checks.length,errors:report.errors,violations:report.accessibility.map(x=>({name:x.name,count:x.violations.length}))}));
if(report.errors.length || report.accessibility.some(x=>x.violations.length)) process.exitCode=1;
