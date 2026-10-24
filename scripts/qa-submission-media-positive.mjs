// Exactly one real draft save, one final submission and one fake-owner eligibility action.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const root='/workspace/dddhack-portal',origin='http://localhost:3000',backend='http://127.0.0.1:8834',out=process.env.QA_OUTPUT||'evidence/submission-media-positive';
assert.equal(process.env.QA_ONE_SYNTHETIC_FINAL,'8834');
assert.ok(!existsSync(out+'/report.json'),'Inspect the recorded write outcome before another run');
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert.equal(source,process.env.QA_ROOT_SOURCE);
const matrix=JSON.parse(readFileSync(process.env.QA_MATRIX||'evidence/submission-media-rework/report.json'));assert.equal(matrix.checks.length,6);assert.equal(matrix.errors.length,0);assert.ok(!matrix.failure);assert.equal(matrix.mutations.length,0);
const sha=value=>createHash('sha256').update(value).digest('hex');
const files=['app/portal.tsx','app/project-media-field.tsx','app/prepare-project-image.ts','app/projects-rules-experience.css','lib/project-media-policy.ts'];
const fingerprint=()=>Object.fromEntries(files.map(file=>[file,sha(readFileSync(root+'/'+file))]));
assert.deepEqual(fingerprint(),matrix.fingerprint);
mkdirSync(out,{recursive:true});
const report={source,backend:8834,syntheticOnly:true,fingerprint:fingerprint(),writes:[],screenshots:[],checks:[],errors:[]};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));save();
const direct=async(view,actor='alice')=>{const r=await fetch(backend+'/api/portal?view='+encodeURIComponent(view),{headers:{cookie:'portal_local_fixture='+actor}});assert.equal(r.status,200);return r.json();};
const versions=items=>items.map(item=>({id:item.id,attempt:item.attempt,sha256:sha(JSON.stringify(item))}));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.addCookies([{name:'portal_local_fixture',value:'alice',url:origin,httpOnly:true,sameSite:'Strict'}]);
const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>{report.errors.push(error.message);save();});
await context.route('**/*',route=>{
 const request=route.request();if(new URL(request.url()).origin!==origin)return route.abort();
 if(!['GET','HEAD'].includes(request.method())){
  const body=request.postDataJSON();assert.ok(['save-project','submit-project'].includes(body.action));
  assert.equal(report.writes.filter(w=>w.action===body.action).length,0,'No duplicate project write');
  assert.ok(Buffer.byteLength(request.postData())<1_000_000,'Bounded command envelope');
  report.writes.push({action:body.action,status:'pending',revision:body.data.revision,projectName:body.data.project.projectName,attestation:body.data.project.attestation,requestBytes:Buffer.byteLength(request.postData()),logoSha256:sha(body.data.project.logo),bannerSha256:sha(body.data.project.banner)});save();
 }
 return route.continue();
});
const shot=async(name,fullPage=true)=>{await page.evaluate(()=>document.fonts.ready);if(fullPage)await page.evaluate(()=>scrollTo(0,0));const path=out+'/'+name+'.png';await page.screenshot({path,fullPage,animations:'disabled',style:'nextjs-portal{visibility:hidden!important}'});report.screenshots.push({path,sha256:sha(readFileSync(path))});save();};
const openEditor=async()=>{await page.goto(origin+'/dashboard#project',{waitUntil:'networkidle',timeout:60000});await page.getByRole('tab',{name:'Project',exact:true}).click();await page.getByRole('button',{name:'Update project',exact:true}).click();await page.locator('.submission-v6[data-hydrated="true"]').waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();};
try{
 const before=await direct('/dashboard');assert.equal(before.submissionAccess.attemptsUsed,2);assert.equal(before.submissionAccess.canCommit,true);report.before={attempts:2,revision:before.project.revision,projectId:before.project.id};report.oldVersions=versions((await direct('/project-history')).items);save();
 await openEditor();
 for(const[kind,name]of[['banner','portrait'],['logo','square-alpha']]){await page.getByLabel('Upload '+kind,{exact:true}).setInputFiles('/tmp/ddd-media-fixtures/'+name+'.png');await page.locator('.submission-media-field-'+kind+' .submission-media-file').filter({hasText:name+'.png'}).waitFor();}
 await page.locator('#submission-attestation-control').check();await shot('full-aspect-media-before-save');
 report.nativeValidity=await page.locator('.project-editor').evaluate(form=>({valid:form.checkValidity(),invalid:[...form.elements].filter(el=>el.willValidate&&!el.validity.valid).map(el=>({name:el.name,type:el.type,message:el.validationMessage}))}));
 report.saveActionability=await page.getByRole('button',{name:'Save draft',exact:true}).evaluate(button=>{const box=button.getBoundingClientRect();return{disabled:button.disabled,type:button.type,hit:button.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)),width:box.width,height:box.height};});save();assert.equal(report.nativeValidity.valid,true);assert.equal(report.saveActionability.disabled,false);assert.equal(report.saveActionability.hit,true);
 const draftResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.request().postDataJSON()?.action==='save-project',{timeout:60000});await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.locator('.confirmation-dialog[open]').waitFor();await shot('save-draft-confirmation',false);await page.locator('.confirmation-dialog').getByRole('button',{name:'Confirm change',exact:true}).click();const draft=await draftResponse;const draftReceipt=await draft.json();Object.assign(report.writes[0],{httpStatus:draft.status(),status:draft.status()===200?'committed':'failed',receipt:draftReceipt});save();assert.equal(draft.status(),200,JSON.stringify(draftReceipt));
 await page.locator('.action-message[data-tone="success"]').waitFor();await shot('save-draft-success');
 const afterDraft=await direct('/dashboard');assert.equal(afterDraft.submissionAccess.attemptsUsed,2);assert.equal(afterDraft.project.revision,before.project.revision+1);report.afterDraft={attempts:2,revision:afterDraft.project.revision};save();
 // Re-enter a focusable field to prove the old green notice is cleared without hiding errors.
 if(await page.locator('.project-editor [name="projectName"]:visible').count()){await page.locator('.project-editor [name="projectName"]:visible').focus();await page.locator('.action-message[data-tone="success"]').waitFor({state:'detached'});}
 await openEditor();await shot('persisted-portrait-and-alpha-reopened');
 await page.getByRole('button',{name:'Submit',exact:true}).click();await page.locator('.confirmation-dialog[open]').waitFor();await shot('third-submission-confirmation',false);
 const submitResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.request().postDataJSON()?.action==='submit-project',{timeout:60000});await page.getByRole('button',{name:'Commit submission',exact:true}).click();const submit=await submitResponse;const submitReceipt=await submit.json();Object.assign(report.writes[1],{httpStatus:submit.status(),status:submit.status()===200?'committed':'failed',receipt:submitReceipt});save();assert.equal(submit.status(),200,JSON.stringify(submitReceipt));assert.ok(submitReceipt.versionId);
 await page.locator('.action-message[data-tone="success"]').waitFor();await shot('third-submission-success');
 const after=await direct('/dashboard');assert.equal(after.submissionAccess.attemptsUsed,3);assert.equal(after.submissionAccess.canCommit,false);assert.equal(after.project.revision,before.project.revision+2);report.after={attempts:3,revision:after.project.revision,canCommit:false,versionId:submitReceipt.versionId};const history=versions((await direct('/project-history')).items);assert.equal(history.length,3);for(const old of report.oldVersions)assert.deepEqual(history.find(v=>v.id===old.id),old);report.versionsAfter=history;save();
 await page.reload({waitUntil:'networkidle'});await page.getByRole('tab',{name:'Project',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Update project',exact:true}).count(),0);await shot('third-commit-readonly-dashboard');await page.getByRole('button',{name:'Versions 3/3',exact:true}).click();await page.locator('.history-version').first().waitFor();assert.equal(await page.locator('.history-version').count(),3);await shot('three-immutable-versions',false);await page.keyboard.press('Escape');await page.locator('.project-history-dialog').waitFor({state:'detached'});
 await page.setViewportSize({width:390,height:480});await shot('portrait-in-dashboard-mobile');await context.close();
 // One root-authorized normal owner command, on the same private synthetic fixture.
 const owner=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await owner.addCookies([{name:'portal_local_fixture',value:'owner',url:origin,httpOnly:true,sameSite:'Strict'}]);const ownerPage=await owner.newPage();await ownerPage.goto(origin+'/dashboard',{waitUntil:'networkidle'});const approval=await ownerPage.evaluate(async(data)=>{const r=await fetch('/api/portal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set-project-eligibility',data}),credentials:'same-origin'});return{status:r.status,body:await r.json()};},{projectId:after.project.id,versionId:submitReceipt.versionId,status:'eligible'});report.writes.push({actor:'fake_owner',action:'set-project-eligibility',projectId:after.project.id,versionId:submitReceipt.versionId,httpStatus:approval.status,status:approval.status===200?'committed':'failed',receipt:approval.body});save();assert.equal(approval.status,200,JSON.stringify(approval.body));await owner.close();
 const publicContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});const publicPage=await publicContext.newPage();await publicContext.route('**/*',r=>!['GET','HEAD'].includes(r.request().method())?r.abort():r.continue());
 for(const width of[1440,390]){await publicPage.setViewportSize({width,height:width===1440?900:844});await publicPage.goto(origin+'/projects/'+after.project.slug,{waitUntil:'networkidle'});await publicPage.locator('.projects-v6[data-hydrated="true"]').waitFor();const path=out+'/public-full-aspect-'+width+'.png';await publicPage.screenshot({path,fullPage:true,animations:'disabled',style:'nextjs-portal{visibility:hidden!important}'});report.screenshots.push({path,sha256:sha(readFileSync(path))});const metrics=await publicPage.locator('.project-banner').evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight,fit:getComputedStyle(image).objectFit,wash:getComputedStyle(image).backgroundColor}));assert.deepEqual({width:metrics.width,height:metrics.height,fit:metrics.fit},{width:128,height:300,fit:'contain'});report.checks.push({name:'Published portrait remains full-aspect with currentteamwash',viewport:width,metrics,passed:true});save();}
 await publicContext.close();assert.equal(report.errors.length,0);assert.deepEqual(fingerprint(),report.fingerprint);report.checks.push({name:'One draft+one final commit+one owner approval; priorversions unchanged; fourthcommit absent',passed:true});save();
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}finally{await browser.close();report.fingerprintAtEnd=fingerprint();save();}
console.log(JSON.stringify({source,writes:report.writes.map(({action,httpStatus,status})=>({action,httpStatus,status})),screenshots:report.screenshots.length,failure:report.failure}));
