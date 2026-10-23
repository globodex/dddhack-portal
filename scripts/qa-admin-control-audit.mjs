// Local compiled synthetic preview only. Read/cancel phase never confirms mutations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

if (!process.argv.includes('--preview-ready')) {
  console.log('Prepared only. Requires the coordinated frozen synthetic preview and --preview-ready.');
  process.exit(0);
}
const origin = 'http://127.0.0.1:4173';
const artifactRoot = resolve(process.env.V6_QA_ARTIFACT_ROOT || '.');
const source = process.env.V6_QA_SOURCE, workerSha = process.env.V6_QA_WORKER_SHA;
assert.match(source || '', /^[a-f0-9]{40}$/);
assert.match(workerSha || '', /^[a-f0-9]{64}$/);
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const worker = join(artifactRoot, 'dist/server/index.js');
assert.equal(hash(worker), workerSha);
assert.equal(execFileSync('git', ['-C', artifactRoot, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), source);
// Read configured owner only for the loopback synthetic identity; never serialize it.
const ownerEmail = readFileSync(join(artifactRoot, 'lib/identity.ts'), 'utf8').match(/OWNER_EMAIL\s*=\s*"([^"]+)"/)[1];
const runId = `${source.slice(0,8)}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const output = resolve(process.env.V6_QA_OUTPUT || 'evidence/v6-admin-controls', runId);
mkdirSync(output, {recursive:true});
const receipt = {source, workerSha256:workerSha, origin, phase:process.env.V6_QA_CAPTURE_ONLY==='1'?'clean-captures-only':'read-cancel', syntheticOnly:true,
  startedAt:new Date().toISOString(), captures:[], checks:[], controls:[], requests:[], blocked:[], errors:[],
  limitations:['Inventory counts are not exhaustive interaction coverage.', 'No confirming writes in this phase.',
    'Trusted loopback identities test authorization gates, not hosted login.',
    'Preview validation and CSV export can append disposable audit/preview records.'],
  writeResetManifest:{required:true, phase:'pending', syntheticTargets:['fake_pending','fake_ivy','fake_carol','fake_credit','visual_project_alice'],
    resetBeforeWrites:'Restart disposable preview with --rich --mockup-review after clean captures; provide root approval and matching hashes.',
    planned:['Single/list/header CSV add-only commits with unique @portal.test addresses', 'Going approval and registered rollback',
      'Named member cancellation then fake_ivy allowed removal; fake_carol locked TEAM_LOCKED guard',
      'Invalid/stale import digest rejection without commit', 'Synthetic private review save and credit Markdown save/restore'],
    excluded:['AI/scoring activation','actual admin grants','secret/voucher reveal','production writes','external writes']}};
const {chromium} = await import('/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs');
const browser = await chromium.launch({headless:true, chromiumSandbox:true});
receipt.browser = browser.version();
let page, role, mode, routePath, seq = 0;
const inventoryMap = new Map();
const currentControls = () => receipt.controls.filter(c => c.role===role && c.mode===mode && c.route===routePath);
async function inventory(state) {
  const rows = await page.evaluate(({state}) => {
    const candidates = [...document.querySelectorAll('button,a,input:not([type=hidden]),select,textarea,summary,[role=tab],dialog[open],[role=dialog]')];
    return candidates.filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map((e,i) => {
      if (!e.dataset.v6AuditControl) e.dataset.v6AuditControl = `c${Math.random().toString(36).slice(2)}`;
      const label = e.labels?.[0]?.cloneNode(true);
      label?.querySelectorAll('input,select,textarea,svg').forEach(n=>n.remove());
      const text = (e.getAttribute('aria-label') || label?.textContent || e.getAttribute('title') || e.textContent || e.getAttribute('placeholder') || '').replace(/\s+/g,' ').trim().slice(0,150);
      return {domId:e.dataset.v6AuditControl, kind:e.tagName.toLowerCase(), type:e.getAttribute('type'),
        name:text, disabled:!!e.disabled || !!e.closest('fieldset[disabled]'), checked:e.checked ?? null,
        href:e.tagName==='A' ? e.getAttribute('href') : undefined,
        valueLength:typeof e.value==='string' ? e.value.length : undefined, state};
    });
  }, {state});
  for(const row of rows) {
    const key = `${role}|${mode}|${routePath}|${row.domId}`;
    if (!inventoryMap.has(key)) {
      const entry = {id:++seq, role,mode,route:routePath,...row,applicable:true,status:'untested',result:'not-run',reason:'No interaction scenario completed for this visible control.'};
      if (row.href && !row.href.startsWith('/') && !row.href.startsWith('#')) Object.assign(entry,{status:'skipped',reason:'External destination excluded from loopback audit.'});
      inventoryMap.set(key,entry);receipt.controls.push(entry);
    }
  }
}
async function mark(locator, reason, result='passed') {
  const ids = await locator.evaluateAll(es=>es.map(e=>e.dataset.v6AuditControl));
  for (const entry of currentControls()) if(ids.includes(entry.domId)) Object.assign(entry,{status:'checked',result,reason});
}
async function step(name, work) {
  try {const details = await work(); receipt.checks.push({role,mode,route:routePath,name,passed:true,...details});}
  catch(e) {receipt.checks.push({role,mode,route:routePath,name,passed:false,error:e.message});}
}
async function activate(locator) {await locator.scrollIntoViewIfNeeded(); if(mode==='touch') await locator.tap(); else await locator.click();}
async function shot(label, fullPage=false) {
  await page.evaluate(()=>document.fonts.ready);
  const path=join(output,`${role}-${mode}-${label}.png`);
  await page.screenshot({path,fullPage,animations:'disabled'});
  receipt.captures.push({role,mode,route:routePath,path,sha256:hash(path),kind:fullPage?'fullpage':'viewport'});
}
async function cancel(target) {
  const dialog=page.locator('dialog.confirmation-dialog[open]'); await dialog.waitFor();
  await inventory('confirmation');
  const text=await dialog.innerText();
  const cancel=dialog.getByRole('button',{name:'Cancel',exact:true});
  const focus=await cancel.evaluate(e=>e===document.activeElement);
  await mark(dialog,'Modal opened; target text and initial Cancel focus verified.');
  const cancelIds=await cancel.evaluateAll(es=>es.map(e=>e.dataset.v6AuditControl));
  const confirmIds=await dialog.locator('button.button:not(.secondary)').evaluateAll(es=>es.map(e=>e.dataset.v6AuditControl));
  await activate(cancel); await dialog.waitFor({state:'hidden'});
  for(const entry of currentControls()) {
    if(cancelIds.includes(entry.domId))Object.assign(entry,{status:'checked',result:'passed',reason:'Activated Cancel and verified dialog dismissed.'});
    if(confirmIds.includes(entry.domId))Object.assign(entry,{status:'skipped',result:'not-run',reason:'Confirming writes explicitly deferred until fresh disposable fixture reset.'});
  }
  assert.ok(focus,'Cancel initial focus'); if(target) assert.ok(text.includes(target),`Missing target ${target}`);
}
async function generic() {
  // Open each native disclosure in the page once, so hidden controls enter the inventory.
  for (const summary of await page.locator('main summary').all()) {
    if(!await summary.isVisible())continue;
    await step('Disclosure expands and restores',async()=>{
      const opened=await summary.evaluate(e=>e.parentElement.open);
      if(opened) await activate(summary);
      await activate(summary);assert.ok(await summary.evaluate(e=>e.parentElement.open));
      await inventory('disclosure-open');await mark(summary,'Opened with pointer and verified native open state.');
      if(!opened)await activate(summary);
    });
  }
  for(const control of await page.locator('main input:disabled,main button:disabled,main select:disabled,main textarea:disabled,main fieldset[disabled] input,main fieldset[disabled] button').all()) {
    if(!await control.isVisible())continue;
    await step('Disabled control remains unavailable',async()=>{assert.ok(await control.isDisabled());await mark(control,'Disabled state asserted; no activation attempted.');});
  }
  for(const search of await page.locator('main input[type=search]').all()) {
    if(!await search.isVisible())continue;
    await step('Search accepts and clears unmatched synthetic query',async()=>{
      await search.fill('v6-no-match-audit');assert.equal(await search.inputValue(),'v6-no-match-audit');
      await search.fill('');assert.equal(await search.inputValue(),'');await mark(search,'Entered and cleared unmatched query; empty value restored.');
    });
  }
  for(const select of await page.locator('main select').all()) {
    if(!await select.isVisible()||await select.isDisabled())continue;
    await step('Select options can be chosen and restored',async()=>{
      const initial=await select.inputValue(); const options=await select.locator('option:not([disabled])').evaluateAll(es=>es.map(e=>e.value));
      // Field values are drafts only, never submitted by this generic interaction.
      for(const value of options) {await select.selectOption(value);assert.equal(await select.inputValue(),value);}
      await select.selectOption(initial);await mark(select,`Selected ${options.length} enabled options and restored original draft.`);
    });
  }
  for(const checkbox of await page.locator('main input[type=checkbox]').all()) {
    if(!await checkbox.isVisible()||await checkbox.isDisabled())continue;
    await step('Checkbox toggles and restores',async()=>{const initial=await checkbox.isChecked();await activate(checkbox);assert.equal(await checkbox.isChecked(),!initial);await inventory('checkbox-toggled');await activate(checkbox);assert.equal(await checkbox.isChecked(),initial);await mark(checkbox,'Toggled with pointer and restored original value.');});
  }
}
async function imports() {
  const open=page.getByRole('button',{name:'Add participants',exact:true});
  if(!await open.isVisible().catch(()=>false))return;
  await step('Single/list/header CSV preview and exact Cancel',async()=>{
    await activate(open);await inventory('import-open');await mark(open,'Opened focused import modal.');
    const add=page.locator('.admin-import');
    assert.ok((await page.locator('.admin-import-dialog').boundingBox()).width<=602);
    for(const [tab,value,target] of [
      ['Single email',`v6-read-${mode}-${role}@portal.test`,`v6-read-${mode}-${role}@portal.test`],
      ['Email list',`v6-list-a-${mode}-${role}@portal.test;v6-list-b-${mode}-${role}@portal.test;bob@portal.test;v6-list-a-${mode}-${role}@portal.test`,'2 participants'],
      ['CSV',`email\nv6-csv-a-${mode}-${role}@portal.test\nv6-csv-b-${mode}-${role}@portal.test\nbob@portal.test\n`,'2 participants']]) {
      const tabControl=add.getByRole('button',{name:tab,exact:true});await activate(tabControl);await inventory(`import-${tab}`);await mark(tabControl,'Selected import source.');
      if(tab==='CSV') {
        const upload=add.locator('input[type=file]');await upload.setInputFiles({name:'synthetic-cancel.csv',mimeType:'text/csv',buffer:Buffer.from(value)});await mark(upload,'Uploaded synthetic header CSV; parsed by actual form.');
        await add.getByLabel('Paste CSV with header row').waitFor();
      } else {const field=add.getByLabel(tab==='Single email'?'Email':'Email list',{exact:true});await field.fill(value);await mark(field,'Entered synthetic import values.');}
      const submit=add.getByRole('button',{name:'Add',exact:true});await activate(submit);await cancel(target);await mark(submit,'Server preview completed; exact-target confirmation cancelled.');
    }
    const csv=add.getByLabel('Paste CSV with header row');await csv.fill('email\nnot-an-email\n');await inventory('invalid-import');
    await activate(add.getByRole('button',{name:'Add',exact:true}));await add.getByRole('alert').waitFor();assert.equal(await page.locator('dialog.confirmation-dialog[open]').count(),0);await mark(csv,'Invalid email produces form error without commit dialog.');
    await shot('import-invalid');
    const close=page.getByRole('button',{name:'Close add participants',exact:true});await activate(close);await mark(close,'Dismissed import modal.');
  });
}
async function participants() {
  const filter=page.getByRole('button',{name:'Participant filters',exact:true});
  if(await filter.isVisible().catch(()=>false)) {await activate(filter);await inventory('filters-expanded');await mark(filter,'Expanded mobile filters.');}
  await generic();
  await step('Participant exact removal cancellation',async()=>{
    const row=page.locator('.participants-table tbody tr').first();const menu=row.locator('.admin-status-menu');
    const summary=menu.locator('summary');if(!await menu.evaluate(e=>e.open))await activate(summary);
    await inventory('person-more');
    const remove=row.getByRole('button',{name:/^Remove participant:/});const name=(await row.locator('.admin-person-identity strong').innerText()).trim();
    await activate(remove);await cancel(name);await mark(remove,'Exact participant removal cancelled.');
  });
  await imports();
}
async function review() {
  for(const tab of await page.getByRole('tab').all()) {
    if(!await tab.isVisible())continue;
    await step('Review tab activates',async()=>{await activate(tab);assert.equal(await tab.getAttribute('aria-selected'),'true');await inventory('review-tab');await mark(tab,'Pointer selected tab; aria-selected verified.');});
  }
  const radios=page.locator('input[type=radio][name=rating]');
  await step(role==='mentor'?'Mentor has no numeric score':'All ten private rating drafts',async()=>{
    if(role==='mentor')assert.equal(await radios.count(),0);
    else {assert.equal(await radios.count(),10);for(const radio of await radios.all()){await activate(radio);assert.ok(await radio.isChecked());await mark(radio,'Selected rating draft with pointer; no save confirmed.');}}
  });
  const body=page.locator('.admin-review-score textarea');
  if(await body.count()) await step('Private review draft Save and Cancel',async()=>{
    await body.fill('[Synthetic control audit] Private draft cancelled.');await mark(body,'Typed synthetic private draft.');
    const save=page.locator('.admin-review-score').getByRole('button',{name:role==='mentor'?'Save advice':'Save score',exact:true});await activate(save);await cancel();await mark(save,'Draft opened confirmation then cancelled; not persisted.');
  });
  await generic();
}
async function settings() {
  assert.equal(await page.getByText('Private arrival details',{exact:true}).count(),0,'Removed private arrival editor must remain absent');
  await step('Owner submission window draft validation and cancellation',async()=>{
    const section=page.locator('.admin-window');
    if(role!=='owner'){assert.equal(await section.count(),0);return;}
    const open=section.getByLabel('Opens (IST)'),close=section.getByLabel('Closes (IST)');const original=await open.inputValue();
    await open.fill(await close.inputValue());assert.ok(await section.getByRole('button',{name:'Publish',exact:true}).isDisabled());await mark(open,'Invalid equal window disables Publish.');await open.fill(original);
    const publish=section.getByRole('button',{name:'Publish',exact:true});await activate(publish);
    // Warnings intentionally require another explicit click after preview.
    if(!await page.locator('dialog.confirmation-dialog[open]').count())await activate(publish);
    await cancel();await mark(publish,'Actual server window preview then confirmation cancelled.');await mark(close,'Existing IST closing value preserved during validation.');
  });
  await generic();
  const credit=page.locator('.admin-settings-credits textarea');
  if(await credit.count())await step('Credit instructions draft cancelled',async()=>{
    const initial=await credit.inputValue();await credit.fill('[Synthetic control audit] Cancelled credit instruction draft.');
    const save=page.locator('.admin-settings-credits').getByRole('button',{name:'Save',exact:true});await activate(save);await cancel();await credit.fill(initial);await mark(credit,'Synthetic Markdown draft cancelled and restored.');await mark(save,'Credit save confirmation cancelled.');
  });
}
const adminRoutes=['/admin/participants','/admin/teams','/admin/credits','/admin/submissions','/admin/settings','/admin/logs'];
const roles=process.env.V6_QA_ROLES?.split(',') || ['owner','admin','volunteer','judge','mentor'];
try {
  for(role of roles)for(mode of ['mouse','touch']) {
    const context=await browser.newContext({viewport:mode==='touch'?{width:390,height:844}:{width:1440,height:1000},isMobile:mode==='touch',hasTouch:mode==='touch',deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());let action;
      if(url.origin!==origin){receipt.blocked.push({role,mode,kind:'external',path:url.pathname,origin:url.origin});return route.abort();}
      if(!['GET','HEAD'].includes(request.method())) {
        try{action=JSON.parse(request.postData()||'{}').action;}catch{}
        if(request.method()!=='POST' || url.pathname!=='/api/portal' || !['preview-import','preview-submission-window','preview-operational-setup','preview-policy-weights'].includes(action)) {
          receipt.blocked.push({role,mode,kind:'mutation',action,path:url.pathname});return route.abort();
        }
      }
      receipt.requests.push({role,mode,method:request.method(),path:url.pathname,...(action?{action}:{})});
      await route.continue({headers:{...request.headers(),'oai-authenticated-user-id':`fake_${role}`,'oai-authenticated-user-email':role==='owner'?ownerEmail:`${role}@portal.test`}});
    });
    page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>receipt.errors.push({role,mode,error:e.message}));
    const routes=process.env.V6_QA_ROUTES?.split(',') || [...adminRoutes,...(role==='owner'||role==='admin'?['/admin/submissions/synthetic-alice']:['/review','/review/synthetic-alice','/review/synthetic-eve'])];
    for(routePath of routes) {
      await step('Route authorization matches role',async()=>{
        await page.goto(origin+routePath,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
        const result=await page.evaluate(async route=>{const r=await fetch('/api/portal?view='+encodeURIComponent(route));const d=await r.json();return {status:r.status,code:d.code,identity:d.me?.id,count:d.items?.length};},routePath);
        const expected=role==='owner' || role==='admin'&&routePath!=='/admin/logs' || role==='volunteer'&&routePath==='/admin/participants' || ['judge','mentor'].includes(role)&&routePath==='/admin/submissions' || ['judge','mentor'].includes(role)&&routePath.startsWith('/review')&&!routePath.endsWith('synthetic-eve');
        assert.equal(result.status,expected?200:403,JSON.stringify(result));
        return {http:result.status,code:result.code,allowed:expected};
      });
      const allowed=receipt.checks.at(-1)?.allowed;
      if(!allowed)continue;
      // Baseline captures happen before opening any local form or filter.
      if(['owner','admin'].includes(role))await shot(routePath.split('/').filter(Boolean).join('-')+'-clean');
      if(process.env.V6_QA_CAPTURE_ONLY==='1')continue;
      await inventory('initial');
      if(routePath==='/admin/participants'&&['owner','admin'].includes(role))await participants();
      else if(routePath.endsWith('synthetic-alice'))await review();
      else if(routePath==='/admin/settings')await settings();
      else await generic();
      if(routePath==='/admin/teams')await step('Team exact membership removal cancelled',async()=>{
        const button=page.getByRole('button',{name:/^Remove .* from /}).first();if(!await button.isVisible()){const summary=page.locator('.admin-team-disclosure summary').first();await activate(summary);}
        await inventory('team-removal');const label=await button.getAttribute('aria-label');await activate(button);await cancel();await mark(button,`Named membership removal cancelled (${label}).`);
      });
    }
    await context.close();
  }
} catch(error){receipt.failure=error.stack;}
finally {
  await browser.close();receipt.finishedAt=new Date().toISOString();receipt.workerUnchanged=hash(worker)===workerSha;
  receipt.summary={checks:receipt.checks.length,passed:receipt.checks.filter(c=>c.passed).length,failed:receipt.checks.filter(c=>!c.passed).length,
    controls:receipt.controls.length,checked:receipt.controls.filter(c=>c.status==='checked').length,untested:receipt.controls.filter(c=>c.status==='untested').length,skipped:receipt.controls.filter(c=>c.status==='skipped').length,captures:receipt.captures.length};
  writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  writeFileSync(join(output,'COVERAGE.md'),`# Synthetic admin control audit\n\nSource ${source}; Worker ${workerSha}.\n\n${JSON.stringify(receipt.summary,null,2)}\n\nEach control in receipt.json records checked, untested, or skipped with a reason. Inventory alone is not completed coverage. No committing writes were authorized in this phase.\n`);
}
console.log(JSON.stringify({output,...receipt.summary,blocked:receipt.blocked,errors:receipt.errors,failedChecks:receipt.checks.filter(c=>!c.passed),failure:receipt.failure},null,2));
if(receipt.failure||receipt.checks.some(c=>!c.passed)||receipt.blocked.length||receipt.errors.length||!receipt.workerUnchanged)process.exitCode=1;
