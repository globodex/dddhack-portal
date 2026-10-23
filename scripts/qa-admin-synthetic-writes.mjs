// Confirming writes require a freshly reset disposable synthetic D1 and root release.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
if(!process.argv.includes('--write-ready')) {console.log('Prepared only. Root must reset disposable --rich --mockup-review fixture after clean captures, then release this write phase with hashes and V6_ADMIN_FRESH_WRITE_FIXTURE.');process.exit(0);}
assert.match(process.env.V6_ADMIN_FRESH_WRITE_FIXTURE||'',/^root-reset-[a-zA-Z0-9-]{8,}$/,'Explicit fresh fixture reset receipt required');
const origin='http://127.0.0.1:4173',artifactRoot=resolve(process.env.V6_QA_ARTIFACT_ROOT||'.');
const source=process.env.V6_QA_SOURCE,workerSha=process.env.V6_QA_WORKER_SHA;
assert.match(source||'',/^[a-f0-9]{40}$/);assert.match(workerSha||'',/^[a-f0-9]{64}$/);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),worker=join(artifactRoot,'dist/server/index.js');
assert.equal(hash(worker),workerSha);assert.equal(execFileSync('git',['-C',artifactRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),source);
const stamp=Date.now().toString(36),prefix=`v6-audit-${stamp}`,output=resolve('evidence/v6-admin-writes',`${source.slice(0,8)}-${stamp}`);mkdirSync(output,{recursive:true});
const report={source,workerSha256:workerSha,phase:'fresh-disposable-synthetic-writes',fixtureReset:process.env.V6_ADMIN_FRESH_WRITE_FIXTURE,startedAt:new Date().toISOString(),checks:[],responses:[],blocked:[],manifest:{before:null,after:null},limitations:['Synthetic loopback identities; not hosted sign-in.','No production data, external writes, admin grants, voucher reveal, AI activation, or scoring enablement.','Expired15-minute preview timing is not simulated; invalid digest guard is tested separately.']};
const {chromium}=await import('/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,chromiumSandbox:true});let page,role='admin',mode='mouse';
function allow(action,data) {
  if(action==='preview-import'||action==='commit-import')return data.kind==='roster' && typeof data.csv==='string' && data.csv.split(/[\s,;]+/).filter(v=>v.includes('@')).every(v=>v=== 'bob@portal.test'||v.startsWith(prefix)&&v.endsWith('@portal.test'));
  if(action==='admin-status')return data.kind==='person'&&data.targetId==='fake_pending'&&['Registered','Going','Checked in','Absent'].includes(data.status);
  if(action==='remove-workspace-member')return ['fake_ivy','fake_carol'].includes(data.userId)&&Object.keys(data).every(k=>['userId','reason'].includes(k));
  if(action==='review-project')return data.projectId==='visual_project_alice'&&String(data.body).startsWith('[Synthetic control audit]')&&(!data.rating||data.rating>=1&&data.rating<=10);
  if(action==='update-credit-instructions')return data.typeId==='fake_credit'&&typeof data.markdown==='string'&&data.markdown.length<1000;
  return false;
}
async function session(nextRole,nextMode) {
  role=nextRole;mode=nextMode;const context=await browser.newContext({viewport:mode==='touch'?{width:390,height:844}:{width:1440,height:1000},isMobile:mode==='touch',hasTouch:mode==='touch',reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){report.blocked.push({kind:'external',origin:url.origin,path:url.pathname});return route.abort();}
    if(!['GET','HEAD'].includes(request.method())) {
      let body;try{body=JSON.parse(request.postData()||'{}');}catch{}
      if(request.method()!=='POST'||url.pathname!=='/api/portal'||!allow(body?.action,body?.data||{})){report.blocked.push({kind:'out-of-scope-write',action:body?.action,path:url.pathname});return route.abort();}
    }
    await route.continue({headers:{...request.headers(),'oai-authenticated-user-id':`fake_${role}`,'oai-authenticated-user-email':`${role}@portal.test`}});
  });
  page=await context.newPage();page.setDefaultTimeout(7000);
  page.on('response',async response=>{if(response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/portal'){try{const b=await response.json(),req=JSON.parse(response.request().postData());report.responses.push({role,mode,action:req.action,status:response.status(),code:b.code});}catch{}}});
  return context;
}
async function activate(loc){await loc.scrollIntoViewIfNeeded();if(mode==='touch')await loc.tap();else await loc.click();}
async function load(path){await page.goto(origin+path,{waitUntil:'networkidle'});}
async function view(path){return page.evaluate(async p=>{const r=await fetch('/api/portal?view='+encodeURIComponent(p));if(!r.ok)throw new Error(`Read ${r.status}`);return r.json();},path);}
async function api(action,data){return page.evaluate(async({action,data})=>{const r=await fetch('/api/portal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,data})});return {status:r.status,body:await r.json()};},{action,data});}
async function check(name,fn){try{const details=await fn();report.checks.push({role,mode,name,passed:true,...details});}catch(e){report.checks.push({role,mode,name,passed:false,error:e.message});}}
async function confirm({cancel=false,target}={}){const dialog=page.locator('dialog.confirmation-dialog[open]');await dialog.waitFor();if(target)assert.ok((await dialog.innerText()).includes(target));if(cancel)await activate(dialog.getByRole('button',{name:'Cancel',exact:true}));else await activate(dialog.locator('button.button:not(.secondary)'));await dialog.waitFor({state:'hidden'});}
function manifest(data){return data.items.map(t=>({id:t.id,locked:t.locked,members:t.members.map(m=>m.id).sort()})).sort((a,b)=>a.id.localeCompare(b.id));}
try {
  const context=await session('admin','mouse');await load('/admin/teams');report.manifest.before=manifest(await view('/admin/teams'));
  assert.ok(report.manifest.before.find(t=>t.id==='fake_team5')?.members.includes('fake_ivy'),'Fresh fixture Ivy required');
  assert.ok(report.manifest.before.find(t=>t.id==='fake_team3')?.locked,'Fresh locked Common Ground required');
  for(const sourceMode of ['Single email','Email list','CSV'])await check(`${sourceMode} actual add-only commit`,async()=>{
    await load('/admin/participants');await activate(page.getByRole('button',{name:'Add participants',exact:true}));const add=page.locator('.admin-import');await activate(add.getByRole('button',{name:sourceMode,exact:true}));
    const suffix=sourceMode==='Single email'?'single':sourceMode==='Email list'?'list':'csv',email=`${prefix}-${suffix}@portal.test`;
    if(sourceMode==='Single email')await add.getByLabel('Email',{exact:true}).fill(email);
    else if(sourceMode==='Email list')await add.getByLabel('Email list',{exact:true}).fill(`${email};${email};bob@portal.test`);
    else await add.locator('input[type=file]').setInputFiles({name:'synthetic-add-only.csv',mimeType:'text/csv',buffer:Buffer.from(`email\n${email}\nbob@portal.test\n`)});
    await activate(add.getByRole('button',{name:'Add',exact:true}));await confirm({target:sourceMode==='Single email'?email:'1 participant'});
    await page.waitForLoadState('networkidle');const data=await view('/admin/participants');assert.equal(data.items.filter(p=>p.email===email).length,1);
    assert.equal(data.items.filter(p=>p.email==='bob@portal.test').length,1);return {newSyntheticRows:1,existingBobRows:1};
  });
  await check('Invalid/stale import digest rejected without commit',async()=>{const result=await api('commit-import',{kind:'roster',csv:`email\n${prefix}-stale@portal.test\n`,digest:'stale-audit-digest'});assert.equal(result.status,409);assert.equal(result.body.code,'PREVIEW_REQUIRED');return {status:result.status,code:result.body.code};});
  for(const status of ['Going','Checked in','Absent','Registered'])await check(`Pending synthetic person status ${status}`,async()=>{
    await load('/admin/participants');
    const filters=page.locator('.admin-participant-filters');await filters.locator('select').nth(0).selectOption('all');await filters.locator('select').nth(1).selectOption('all');await filters.locator('input[type=search]').fill('pending@portal.test');
    const row=page.locator('.participants-table tbody tr');assert.equal(await row.count(),1);
    const menu=row.locator('.admin-status-menu');await activate(menu.locator('summary'));await menu.locator('select[name=status]').selectOption(status);await menu.getByLabel('Audit reason',{exact:true}).fill('[Synthetic control audit] Reserved pending participant status.');
    const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/portal'));await activate(menu.getByRole('button',{name:'Review status change',exact:true}));await confirm();const response=await responsePromise;assert.ok(response.ok(),`Status response ${response.status()}`);
    const person=(await view('/admin/participants')).items.find(p=>p.id==='fake_pending');assert.equal(person.status,status);return {status:response.status(),personStatus:person.status};
  });
  await check('Synthetic credit Markdown save and restore',async()=>{
    await load('/admin/settings');let form=page.locator('.admin-settings-credits');await form.locator('select').selectOption('fake_credit');const original=await form.locator('textarea').inputValue();
    for(const markdown of [`[Synthetic control audit] ${prefix} instructions.`,original]) {
      form=page.locator('.admin-settings-credits');await form.locator('textarea').fill(markdown);const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/portal'));await activate(form.getByRole('button',{name:'Save',exact:true}));await confirm();const response=await responsePromise;assert.ok(response.ok(),`Credit response ${response.status()}`);
      await page.waitForLoadState('networkidle');await load('/admin/settings');assert.equal(await page.locator('.admin-settings-credits textarea').inputValue(),markdown);
    }
    return {provider:'fake_credit',restored:true};
  });
  await check('Locked membership Cancel then server guard',async()=>{
    await load('/admin/teams');const button=page.getByRole('button',{name:/^Remove Carol from Common Ground$/});await activate(button);await confirm({cancel:true,target:'Carol'});
    assert.ok(manifest(await view('/admin/teams')).find(t=>t.id==='fake_team3').members.includes('fake_carol'));
    const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/portal'));await activate(button);await confirm({target:'Carol'});const response=await responsePromise;const body=await response.json();assert.equal(response.status(),409);assert.equal(body.code,'TEAM_LOCKED');
    assert.ok(manifest(await view('/admin/teams')).find(t=>t.id==='fake_team3').members.includes('fake_carol'));return {status:response.status(),code:body.code};
  });
  await check('Unlocked named synthetic member removed successfully',async()=>{
    await load('/admin/teams');const team=page.locator('.admin-team-list > li').filter({hasText:'The Fifth Element'}).first();const disclosure=team.locator('.admin-team-disclosure');if(!await disclosure.evaluate(e=>e.open))await activate(disclosure.locator('summary').first());
    const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/portal'));await activate(page.getByRole('button',{name:/^Remove Ivy from The Fifth Element$/}));await confirm({target:'Ivy'});const response=await responsePromise;assert.ok(response.ok(),`Remove response ${response.status()}`);
    assert.ok(!manifest(await view('/admin/teams')).find(t=>t.id==='fake_team5').members.includes('fake_ivy'));return {status:response.status(),target:'fake_ivy'};
  });
  report.manifest.after=manifest(await view('/admin/teams'));await context.close();
  for(const reviewer of ['judge','mentor']) {
    const reviewContext=await session(reviewer,'touch');
    await check('Synthetic private review actual save',async()=>{
      await load('/review/synthetic-alice');const form=page.locator('.admin-review-score');if(reviewer==='judge')await activate(form.locator('input[type=radio][name=rating][value="7"]'));else assert.equal(await form.locator('input[name=rating]').count(),0);
      await form.locator('textarea').fill(`[Synthetic control audit] ${prefix} ${reviewer} advice.`);
      await activate(form.getByRole('button',{name:reviewer==='judge'?'Save score':'Save advice',exact:true}));await confirm();await page.waitForLoadState('networkidle');
      const data=await view('/review/synthetic-alice');const own=data.history.find(r=>r.author_id===`fake_${reviewer}`&&String(r.body||'').includes(prefix));assert.ok(own,'Private history receipt missing');if(reviewer==='judge')assert.equal(own.rating,7);else assert.equal(own.rating,null);return {actor:`fake_${reviewer}`,private:true};
    });await reviewContext.close();
  }
} catch(e){report.failure=e.stack;}
finally{await browser.close();report.finishedAt=new Date().toISOString();report.workerUnchanged=hash(worker)===workerSha;report.summary={checks:report.checks.length,passed:report.checks.filter(c=>c.passed).length,failed:report.checks.filter(c=>!c.passed).length};writeFileSync(join(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({output,...report.summary,failed:report.checks.filter(c=>!c.passed),blocked:report.blocked,failure:report.failure},null,2));
if(report.failure||report.checks.some(c=>!c.passed)||report.blocked.length||!report.workerUnchanged)process.exitCode=1;
