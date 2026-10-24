import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const origin='http://localhost:3011',out='evidence/admin-action-refinement/before';mkdirSync(out,{recursive:true});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fingerprints:Object.fromEntries(['app/portal.tsx','app/admin-credit-batches.tsx','app/admin-experience.css'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),screenshots:[],errors:[],mutations:[]};
const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
const c=await b.newContext({viewport:{width:1440,height:900},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
await c.addCookies([{name:'portal_local_fixture',value:'owner',url:origin}]);
await c.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==origin)return route.abort('blockedbyclient');if(!['GET','HEAD'].includes(r.method())){report.mutations.push(r.url());return route.abort('blockedbyclient');}return route.continue();});
const p=await c.newPage();p.on('pageerror',e=>report.errors.push(String(e)));p.setDefaultTimeout(20000);
const shot=async(name)=>{await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>scrollTo(0,0));const path=out+'/'+name+'.png';await p.screenshot({path,fullPage:true,animations:'disabled',caret:'initial',style:'nextjs-portal{visibility:hidden!important}'});report.screenshots.push({path,viewport:p.viewportSize(),inspected:false});writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');};
try{
 const h=await(await c.request.get(origin+'/api/health')).json();if(!h.freshSeedNotCopy)throw Error('NOT_FRESH_SYNTHETIC');
 await p.goto(origin+'/admin/participants',{waitUntil:'networkidle',timeout:60000});
 await expect(p.getByRole('button',{name:'Add participants',exact:true})).toBeEnabled();
 await p.getByRole('searchbox').fill('carol@portal.test');await expect(p.locator('tbody tr')).toHaveCount(1);
 for(const viewport of [{width:1440,height:900},{width:390,height:480},{width:320,height:480}]){await p.setViewportSize(viewport);await shot('participants-going-'+viewport.width);}
 await p.setViewportSize({width:1440,height:900});await p.goto(origin+'/admin/credits',{waitUntil:'networkidle',timeout:60000});await p.locator('.credit-upload-management > summary').click();await expect(p.getByRole('button',{name:'Delete column: OpenAI credits',exact:true})).toBeEnabled();
 await shot('credits-1440');await p.setViewportSize({width:390,height:480});await shot('credits-390');await p.setViewportSize({width:1440,height:900});await p.goto(origin+'/admin/teams',{waitUntil:'networkidle',timeout:60000});await expect(p.locator('.admin-team-list > li').first()).toBeVisible();if(await p.locator('.admin-team-disclosure').first().getAttribute('open')===null)await p.locator('.admin-team-disclosure > summary').first().click();await shot('teams-1440');await p.setViewportSize({width:390,height:480});await shot('teams-390');
}finally{report.closed=true;writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');await c.close();await b.close();}
