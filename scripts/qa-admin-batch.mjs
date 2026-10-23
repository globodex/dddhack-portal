// Local, synthetic admin capture batches. Never imported by application code.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,...rest]=value.replace(/^--/,'').split('=');return [key,rest.join('=')];}));
assert.match(args.head||'',/^[a-f0-9]{40}$/,'Pass parent-confirmed full source HEAD');
assert.match(args.worker||'',/^[a-f0-9]{64}$/,'Pass parent-confirmed full compiled Worker SHA256');
const stage=args.stage||'core',offset=Number(args.offset||0),limit=Number(args.limit||10);
assert.ok(['core','sections','dialogs'].includes(stage));assert.ok(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=20);
const origin='http://127.0.0.1:4173',build=`${args.head.slice(0,8)}-${args.worker.slice(0,8)}`,out=`evidence/admin-batch-${build}`;
mkdirSync(out,{recursive:true});
const ledgerPath=`${out}/ledger.json`;
let ledger;try{ledger=JSON.parse(readFileSync(ledgerPath,'utf8'));}catch{ledger={sourceHead:args.head,workerSha256:args.worker,origin,syntheticOnly:true,sandbox:true,captures:[],checks:[],blocked:[],requests:[],pageErrors:[]};}
assert.equal(ledger.sourceHead,args.head);assert.equal(ledger.workerSha256,args.worker);
const ownerEmail=/OWNER_EMAIL = ["']([^"']+)/.exec(readFileSync('lib/identity.ts','utf8'))?.[1];assert.ok(ownerEmail);
const identities={admin:{id:'fake_admin',email:'admin@portal.test'},owner:{id:'fake_owner',email:ownerEmail}};
const viewports={desktop:{width:1440,height:900},mobile:{width:390,height:844}};
const routes=[
 {key:'participants',path:'/admin/participants',role:'admin'},
 {key:'teams',path:'/admin/teams',role:'admin'},
 {key:'submissions',path:'/admin/submissions',role:'admin'},
 {key:'review',path:'/admin/submissions/synthetic-alice',role:'admin'},
 {key:'credits',path:'/admin/credits',role:'admin'},
 {key:'settings',path:'/admin/settings',role:'admin'},
 {key:'settings',path:'/admin/settings',role:'owner'},
 {key:'logs',path:'/admin/logs',role:'owner'},
];
const core=routes.flatMap(route=>Object.keys(viewports).flatMap(viewport=>['fullpage','viewport'].map(kind=>({...route,viewport,kind,state:'default'}))));
const {chromium}=await import('/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,chromiumSandbox:true});ledger.browser=browser.version();
let active,activeKey='',activePage='';
function persist(){writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');}
async function pageFor(role,viewport){
 const key=`${role}-${viewport}`;if(activeKey===key)return active.page;
 if(active)await active.context.close();
 const context=await browser.newContext({viewport:viewports[viewport],serviceWorkers:'block'});
 await context.route('**/*',async route=>{const request=route.request();if(new URL(request.url()).origin!==origin){ledger.blocked.push({kind:'external',origin:new URL(request.url()).origin});persist();return route.abort('blockedbyclient');}
 if(!['GET','HEAD'].includes(request.method())){let action;try{action=JSON.parse(request.postData()||'{}').action;}catch{}ledger.requests.push({method:request.method(),action:action||'unknown'});if(action!=='preview-import'){ledger.blocked.push({kind:'mutation',action:action||'unknown'});persist();return route.abort('blockedbyclient');}}
 return route.continue({headers:{...request.headers(),'oai-authenticated-user-id':identities[role].id,'oai-authenticated-user-email':identities[role].email}});});
 const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>ledger.pageErrors.push(error.message));active={context,page};activeKey=key;activePage='';return page;
}
async function load(spec,{fresh=false}={}){const page=await pageFor(spec.role,spec.viewport);if(fresh||activePage!==spec.path){await page.goto(origin+spec.path);await page.locator('main').waitFor();await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);activePage=spec.path;}assert.equal(new URL(page.url()).origin,origin);assert.equal(new URL(page.url()).pathname,spec.path);return page;}
function slug(value){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'section';}
async function capture(spec,page,locator){
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(180);
 const name=`admin-${spec.key}-${spec.role}-${spec.viewport}-${slug(spec.state||'default')}-${spec.kind}-${build}`,path=`${out}/${name}.png`;
 const mask=[page.getByText(ownerEmail,{exact:false}),page.locator(`input[value="${ownerEmail}"]`)];
 if(locator)await locator.screenshot({path,animations:'disabled',mask});else await page.screenshot({path,fullPage:spec.kind==='fullpage',animations:'disabled',mask});
 const bytes=readFileSync(path),image={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 const metrics=await page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,headings:[...document.querySelectorAll('main h1,main h2,main h3')].map(node=>node.textContent.trim()),participantFirstRowTop:document.querySelector('.admin-participant-filters ~ .table-scroll tbody tr')?.getBoundingClientRect().top??null,collapsedImportHeight:document.querySelector('details.panel:has(> .admin-import):not([open])')?.getBoundingClientRect().height??null}));
 const item={id:name,route:spec.path,role:spec.role,viewport:spec.viewport,state:spec.state||'default',kind:spec.kind,path,image,sha256:createHash('sha256').update(bytes).digest('hex'),metrics,inspected:false,library:null};
 const existing=ledger.captures.findIndex(row=>row.id===name);if(existing<0)ledger.captures.push(item);else ledger.captures[existing]=item;
 persist();console.log(JSON.stringify({captured:item.id,path,itemDimensions:image}));return item;
}
async function dialog(page,spec){const modal=page.locator('dialog[open]');await modal.waitFor();const cancel=modal.getByRole('button',{name:'Cancel',exact:true});try{const focus=await cancel.evaluate(node=>node===document.activeElement);ledger.checks.push({name:spec.state,route:spec.path,cancelFocused:focus});await capture({...spec,kind:'viewport'},page);}finally{await cancel.click();await modal.waitFor({state:'hidden'});}}
async function coreStage(){for(const spec of core.slice(offset,offset+limit)){const page=await load(spec);await page.evaluate(()=>window.scrollTo(0,0));await capture(spec,page);}ledger.corePlan=core.map(spec=>({route:spec.path,role:spec.role,viewport:spec.viewport,kind:spec.kind}));}
async function openDetails(page){const details=page.locator('main details');for(let index=0;index<await details.count();index++){const target=details.nth(index);if(!await target.evaluate(node=>node.open)){const summary=target.locator(':scope > summary');if(await summary.isVisible())await summary.click();}}}
async function sectionStage(){
 const planned=[];
 for(const route of routes)for(const viewport of Object.keys(viewports)){
  const spec={...route,viewport};const page=await load(spec,{fresh:true});
  // Native disclosures are opened only; no submit/reveal buttons are activated.
  await openDetails(page);
  const sections=page.locator('main').locator('.panel,.admin-control,.admin-team-list > li,.review-layout > article,.review-layout > aside');
  const records=await sections.evaluateAll(nodes=>nodes.map((node,index)=>({index,title:node.querySelector('h2,h3,summary,legend')?.textContent?.trim()||node.getAttribute('aria-label')||`Section ${index+1}`,visible:!!node.getBoundingClientRect().height,topLevel:!node.parentElement?.closest('.panel,.admin-control,.admin-team-list > li')})).filter(row=>row.visible&&row.topLevel));
  for(const record of records)planned.push({...spec,sectionIndex:record.index,state:`section-${record.index+1}-${record.title}`,kind:'section'});
 }
 ledger.sectionPlan=planned;persist();
 for(const spec of planned.slice(offset,offset+limit)){
  const page=await load(spec,{fresh:true});await openDetails(page);const target=page.locator('main').locator('.panel,.admin-control,.admin-team-list > li,.review-layout > article,.review-layout > aside').nth(spec.sectionIndex);await target.scrollIntoViewIfNeeded();await capture(spec,page,target);
 }
}
async function dialogStage(){
 const plans=Object.keys(viewports).flatMap(viewport=>['single','list','csv','participant-remove','project-remove','version-remove','add-admin','reveal'].map(state=>({viewport,state})));
 for(const plan of plans.slice(offset,offset+limit)){
  const owner=['add-admin','reveal'].includes(plan.state),spec={key:plan.state,role:owner?'owner':'admin',viewport:plan.viewport,path:owner?'/admin/settings':plan.state.includes('project')||plan.state.includes('version')?'/admin/submissions/synthetic-alice':'/admin/participants',state:plan.state,kind:'viewport'};
  const page=await load(spec,{fresh:true});
  if(['single','list','csv'].includes(plan.state)){
   const region=page.locator('.admin-import');await page.locator('details.panel').filter({has:region}).locator('summary').click();
   if(plan.state==='single')await region.getByLabel('Email',{exact:true}).fill('qa-batch-single@portal.test');
   if(plan.state==='list'){await region.getByRole('button',{name:'Email list',exact:true}).click();await region.getByLabel('Email list',{exact:true}).fill('qa-batch-first@portal.test;qa-batch-second@portal.test;qa-batch-first@portal.test;bob@portal.test');}
   if(plan.state==='csv'){await region.getByRole('button',{name:'CSV',exact:true}).click();await region.locator('input[type=file]').setInputFiles({name:'synthetic-only.csv',mimeType:'text/csv',buffer:Buffer.from('email\nqa-batch-first@portal.test\nqa-batch-second@portal.test\nbob@portal.test\n')});}
   await region.scrollIntoViewIfNeeded();await capture({...spec,state:`${plan.state}-form`},page);await region.getByRole('button',{name:'Add',exact:true}).click();await dialog(page,{...spec,state:`${plan.state}-confirm-cancel`});
  }else if(plan.state==='participant-remove'){
   const first=page.locator('.participants-table tbody tr').first();const button=first.getByRole('button',{name:/^Remove participant(?::|$)/});if(!await button.isVisible())await first.locator('summary').filter({hasText:'Remove participant'}).click();await button.click();await dialog(page,spec);
  }else if(['project-remove','version-remove'].includes(plan.state)){
   const region=page.locator('.admin-project-action');await page.locator('details').filter({has:region}).first().locator('summary').first().click();
   if(plan.state==='version-remove'){await region.getByLabel('Target',{exact:true}).selectOption('submission');await region.getByLabel('Version',{exact:true}).selectOption({index:1});}
   await region.getByRole('button',{name:/^Remove(?:$| project:| submission:| project and submission:)/}).click();await dialog(page,spec);
  }else if(plan.state==='add-admin'){
   const region=page.locator('.admin-add-admins');await region.getByLabel('Email',{exact:true}).fill('alice@portal.test');await region.getByRole('button',{name:'Add',exact:true}).click();await dialog(page,spec);
  }else{
   const button=page.getByRole('button',{name:'Reveal AI scores',exact:true});await button.scrollIntoViewIfNeeded();
   if(await button.isDisabled()){ledger.checks.push({name:'reveal',viewport:plan.viewport,outcome:'Blocked by genuine unconfigured judging/scoring state; no bypass'});await capture({...spec,state:'reveal-disabled'},page);}else{await button.click();await dialog(page,spec);}
  }
 }
 ledger.dialogPlan=plans;persist();
}
try{if(stage==='core')await coreStage();if(stage==='sections')await sectionStage();if(stage==='dialogs')await dialogStage();}catch(error){ledger.failure={stage,offset,error:error.message};persist();throw error;}finally{if(active)await active.context.close();await browser.close();persist();}
console.log(JSON.stringify({ledger:ledgerPath,captures:ledger.captures.length,stage,offset,limit,browserClosed:true}));
