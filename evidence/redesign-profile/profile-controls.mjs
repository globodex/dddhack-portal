import assert from 'node:assert/strict';
import { chromium } from '/workspace/dddhack-portal/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '/workspace/dddhack-portal/node_modules/@axe-core/playwright/dist/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const origin=process.env.PROFILE_ORIGIN||'http://127.0.0.1:3000';
const output=process.env.PROFILE_EVIDENCE||'/workspace/dddhack-portal/evidence/redesign-profile';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
assert.equal(new URL(origin).protocol,'http:');
mkdirSync(output,{recursive:true});
const source=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:process.env.PROFILE_ROOT||'/workspace/dddhack-portal',encoding:'utf8'}).trim();
const report={source:source(),origin,syntheticOnly:true,cssInjected:false,checks:[],errors:[],writes:[],accessibility:[],screenshots:[]};
const persist=()=>writeFileSync(output+'/controls-report.json',JSON.stringify(report,null,2));
const check=name=>{report.checks.push({name,passed:true});persist();};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
try {
for(const mode of (process.env.PROFILE_MODE?[process.env.PROFILE_MODE]:['keyboard','touch'])) {
 const context=await browser.newContext({viewport:mode==='touch'?{width:390,height:480}:{width:1440,height:900},reducedMotion:'reduce',hasTouch:mode==='touch',isMobile:mode==='touch',serviceWorkers:'block'});
 await context.addCookies([{name:'portal_local_fixture',value:'alice',url:origin,httpOnly:true,sameSite:'Strict'}]);
 const posts=[];
 let releaseSave;
 await context.route('**/*',async r=>{
   const q=r.request(),url=new URL(q.url());
   if(url.origin!==origin) return r.abort('blockedbyclient');
   if(!['GET','HEAD'].includes(q.method())) {
    const b=q.postDataJSON();
    assert.equal(q.method(),'POST');assert.equal(url.pathname,'/api/portal');assert.equal(b.action,'complete-profile');
    posts.push(b);assert.equal(posts.length,1,'one committed profile Save per mode');
    await new Promise(resolve=>{releaseSave=resolve;});
   }
   return r.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push({mode,error:e.message}));
 const activate=async target=> mode==='touch'?target.tap():(await target.focus(),await target.press('Enter'));
 const edit=async(target,value)=>{await target.fill(value);};
 await page.goto(origin+'/profile',{waitUntil:'networkidle'});
 await page.locator('.profile-flow[data-step="1"][data-hydrated="true"]').waitFor();
 assert.equal(await page.getByLabel('Full name',{exact:false}).inputValue(),mode==='keyboard'?'Alice':'Alice Keyboard QA');
 assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(),'alice@portal.test');
 assert.equal(await page.getByLabel('Email',{exact:true}).getAttribute('readonly'),'');
 check(mode+': authenticated email and stored profile values prefill');
 assert.equal(await page.locator('input[name="avatarExpression"]').count(),8);
 assert.equal(await page.locator('input[name="avatarColor"]').count(),8);
 check(mode+': exact 8 expression and8 color choices');
 for(const color of ['blue','grey','purple']) {
  const target=page.locator(`input[name="avatarColor"][value="${color}"]`);
  if(mode==='touch')await target.tap();else{await target.focus();await target.press('Space');}
  const fills=await page.locator('.profile-expression-grid svg circle').evaluateAll(ns=>ns.map(n=>n.getAttribute('fill')));
  assert.equal(new Set(fills).size,1);
  assert.equal(await page.locator('input[name="avatarExpression"]:checked').count(),1);
 }
 const radioVisibility=await page.locator('.profile-avatar-choice input').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).opacity==='0'));
 assert.equal(radioVisibility,true);
 check(mode+': single selected color updates all8 previews, expression staysselected, native radios invisible');
 const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,fieldOverflow:getComputedStyle(document.querySelector('.profile-fields')).overflowY,fieldClient:document.querySelector('.profile-fields').clientHeight,fieldScroll:document.querySelector('.profile-fields').scrollHeight}));
 assert.equal(geometry.overflow,false);assert.equal(geometry.fieldOverflow,'visible');assert.ok(geometry.fieldScroll<=geometry.fieldClient+1);
 check(mode+': normal document scroll, no horizontal/internal field clipping');
 await edit(page.locator('input[name="fullName"]'),'');
 await edit(page.locator('input[name="bio"]'),'');
 await activate(page.getByRole('button',{name:'Next',exact:true}));
 await page.locator('#profile-name-error').waitFor();
 assert.equal(await page.locator('input[name="fullName"]').getAttribute('aria-invalid'),'true');
 assert.equal(await page.locator('input[name="bio"]').getAttribute('aria-describedby'),'profile-bio-error');
 assert.equal(await page.locator('input[name="fullName"]').evaluate(n=>n===document.activeElement),true);
 assert.equal(posts.length,0);
 await page.screenshot({path:`${output}/profile-error-basics-${mode}.png`,fullPage:true,animations:'disabled'});
 report.screenshots.push(`profile-error-basics-${mode}.png`);
 check(mode+': invalid basics shown at fields and first invalid field focused without request');
 const name=mode==='keyboard'?'Alice Keyboard QA':'Alice Touch QA';
 await edit(page.locator('input[name="fullName"]'),name);
 await edit(page.locator('input[name="bio"]'),'Synthetic profile interaction verification');
 for(const value of ['squeezed','sleepy','plus','star','round','cheerful','mixed-plus','mixed-slash']) {
  const target=page.locator(`input[name="avatarExpression"][value="${value}"]`);
  if(mode==='touch')await target.tap();else{await target.focus();await target.press('Space');}
  assert.equal(await target.isChecked(),true);
 }
 for(const value of ['blue','green','purple','orange','charcoal','grey','coral','yellow']) {
  const target=page.locator(`input[name="avatarColor"][value="${value}"]`);
  if(mode==='touch')await target.tap();else{await target.focus();await target.press('Space');}
  assert.equal(await target.isChecked(),true);
 }
 const gender=page.locator('input[name="sex"][value="non-binary"]');
 if(mode==='touch')await gender.locator('..').tap();else{await gender.focus();await gender.press('Space');}
 check(mode+': all expression/color radios and sex respond to input');
 await activate(page.getByRole('button',{name:'Next',exact:true}));
 await page.locator('.profile-flow[data-step="2"]').waitFor();
 assert.equal(await page.locator('h1').evaluate(n=>n===document.activeElement),true);
 await edit(page.locator('input[name="phone"]'),'123');
 await edit(page.locator('input[type="url"]').first(),'http://example.test/invalid');
 await activate(page.getByRole('button',{name:'Next',exact:true}));
 await page.locator('#profile-phone-error').waitFor();
 assert.equal(await page.locator('input[name="phone"]').evaluate(n=>n===document.activeElement),true);
 assert.equal(await page.locator('#profile-social-0-error').textContent(),'Enter a complete https:// link.');
 assert.equal(posts.length,0);
 await page.screenshot({path:`${output}/profile-error-contact-${mode}.png`,fullPage:true,animations:'disabled'});
 report.screenshots.push(`profile-error-contact-${mode}.png`);
 check(mode+': international phone andhttps URL errors linked to fields');
 await edit(page.locator('input[name="phone"]'),'+1 (202) 555-0100');
 await page.locator('.profile-platform-select select').first().selectOption('Website');
 await edit(page.locator('input[type="url"]').first(),'https://example.test/'+mode);
 await activate(page.getByRole('button',{name:'Add',exact:true}));
 assert.equal(await page.locator('input[type="url"]').count(),2);
 await page.locator('.profile-platform-select select').nth(1).selectOption('GitHub');
 await edit(page.locator('input[type="url"]').nth(1),'https://github.com/synthetic-fixture');
 await activate(page.getByRole('button',{name:'Remove GitHub link 2',exact:true}));
 assert.equal(await page.locator('input[type="url"]').count(),1);
 assert.equal(await page.locator('input[type="url"]').inputValue(),'https://example.test/'+mode);
 check(mode+': icon picker, Add and remove preserve remaining social link');
 await activate(page.getByRole('button',{name:'Previous profile step',exact:true}));
 await page.locator('.profile-flow[data-step="1"]').waitFor();
 assert.equal(await page.locator('input[name="fullName"]').inputValue(),name);
 assert.equal(await page.locator('input[name="avatarColor"][value="yellow"]').isChecked(),true);
 await activate(page.getByRole('button',{name:'Next',exact:true}));
 await page.locator('.profile-flow[data-step="2"]').waitFor();
 assert.equal(await page.locator('input[type="url"]').inputValue(),'https://example.test/'+mode);
 await activate(page.getByRole('button',{name:'Next',exact:true}));
 await page.locator('.profile-flow[data-step="3"]').waitFor();
 await page.locator('select[name="bestDescription"]').selectOption('Independent Developer');
 await edit(page.getByLabel('Organization',{exact:true}),'Synthetic fixture organization');
 await edit(page.getByLabel('OpenAI org ID',{exact:true}),'org-synthetic-profile');
 check(mode+': back and next preserve data across all3 steps');
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 report.accessibility.push({mode,step:3,violations:axe.violations});
 persist();
 assert.equal(axe.violations.length,0);
 check(mode+': step3 automated WCAG scan has zero violations');
 await activate(page.getByRole('button',{name:'Save',exact:true}));
 await page.getByRole('button',{name:'Saving…',exact:false}).waitFor();
 assert.equal(await page.locator('.profile-fields').getAttribute('disabled'),'');
 await page.screenshot({path:`${output}/profile-save-loading-${mode}.png`,fullPage:true,animations:'disabled'});
 report.screenshots.push(`profile-save-loading-${mode}.png`);
 check(mode+': saving state disables fields andcommits no duplicate request');
 releaseSave();
 await page.waitForURL('**/teams');
 assert.equal(posts.length,1);
 assert.equal(await page.locator('dialog[open]').count(),0);
 const result=await context.request.get(origin+'/api/portal?view=%2Fprofile');
 const saved=(await result.json()).profile;
 assert.equal(saved.display_name,name);assert.equal(saved.phone,'+12025550100');
 assert.equal(saved.bio,'Synthetic profile interaction verification');
 assert.equal(saved.best_description,'Independent Developer');
 assert.equal(saved.organization,'Synthetic fixture organization');
 assert.equal(saved.openai_org_id,'org-synthetic-profile');
 assert.equal(saved.avatar_color,'yellow');assert.equal(saved.avatar_expression,'mixed-slash');
 assert.deepEqual(saved.socials,['https://example.test/'+mode]);
 report.writes.push({mode,actor:'fake_alice',action:'complete-profile',count:posts.length,status:'persisted'});
 check(mode+': Save posts once, persists every field and redirects straight to teams without confirmation');
 await context.close();
}
assert.equal(report.errors.length,0);
} catch(error) {report.failure=String(error.stack||error);process.exitCode=1;}
finally {await browser.close();report.sourceAtEnd=source();persist();}
console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,writes:report.writes,report:output+'/controls-report.json'},null,2));
