import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
// Local synthetic same-fixture diagnostics only. No hosted speed claim.
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:3000',out=process.env.QA_OUTPUT||'evidence/final-performance';mkdirSync(out,{recursive:true});
const sourceRoot=process.env.QA_SOURCE_ROOT||process.cwd();
const report={source:execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim(),sourceRuntimeChanges:execFileSync('git',['status','--short','--','app','lib','neon','next.config.ts'],{cwd:sourceRoot,encoding:'utf8'}).trim(),origin,backend:'disposable rich synthetic fixture8789',syntheticOnly:true,writes:false,browserSandbox:false,startedAt:new Date().toISOString(),screenshots:[],metrics:[],errors:[],blocked:[],limitations:['Fresh browser contexts with HTTP cache disabled, warm local Next development server, unthrottled device. Three samples per route are diagnostics, not a hosted capacity or production-speed claim.','Chromium native sandbox unavailable in executor; isolated localhost-only contexts and non-GET denial.','CDP encodedDataLength includes observed completed requests by sampling time. Dev-server HMR may remain open and is excluded from completed-request bytes.']};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false,args:['--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1,EXCLUDE localhost'],env:{...process.env,XDG_CONFIG_HOME:'/tmp/ddd-rich-config',XDG_CACHE_HOME:'/tmp/ddd-rich-cache'}});
const scenarios=[['dashboard','/dashboard','alice'],['discover-people','/discover/participants','alice'],['discover-teams','/discover/teams','alice'],['admin-participants','/admin/participants','owner'],['admin-teams','/admin/teams','owner'],['admin-projects','/admin/submissions','owner'],['settings','/admin/settings','owner']];
for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 for(const[label,path,actor]of scenarios){
  const samples=viewport.width===1440?3:1;
  for(let sample=1;sample<=samples;sample++){
   console.log('START',label,viewport.width,sample);
   const context=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width<500,isMobile:viewport.width<500});
   await context.addCookies([{name:'portal_local_fixture',value:actor,url:origin,httpOnly:true,sameSite:'Strict'}]);
   await context.route('**/*',route=>{const q=route.request();if(new URL(q.url()).origin!==origin||!['GET','HEAD'].includes(q.method())){report.blocked.push({label,sample,viewport,url:q.url(),method:q.method()});return route.abort();}return route.continue();});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push({label,sample,viewport,error:e.message}));
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   const requests=new Map(),finished=[];
   cdp.on('Network.requestWillBeSent',p=>requests.set(p.requestId,{id:p.requestId,url:p.request.url,method:p.request.method,type:p.type}));
   cdp.on('Network.responseReceived',p=>{const row=requests.get(p.requestId);if(row)Object.assign(row,{status:p.response.status,mime:p.response.mimeType,fromDiskCache:!!p.response.fromDiskCache,fromServiceWorker:!!p.response.fromServiceWorker});});
   cdp.on('Network.loadingFinished',p=>{const row=requests.get(p.requestId);if(row){row.encodedDataLength=p.encodedDataLength;finished.push(row);}});
   try{
    const started=Date.now();const response=await page.goto(origin+path,{waitUntil:'networkidle',timeout:60000});await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>{const el=document.getElementById('main');return el&&Object.keys(el).some(k=>k.startsWith('__reactFiber'));});await page.waitForTimeout(200);
    const diagnostic=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(n=>n.toJSON()),paint:performance.getEntriesByType('paint').map(n=>n.toJSON()),resources:performance.getEntriesByType('resource').map(n=>n.toJSON()),domNodes:document.querySelectorAll('*').length,heading:document.querySelector('h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth}));
    report.metrics.push({label,path,actor,viewport,sample,coldBrowserContext:true,httpCacheDisabled:true,httpStatus:response.status(),elapsedToSampleMs:Date.now()-started,ttfbMs:diagnostic.navigation[0]?.responseStart-diagnostic.navigation[0]?.requestStart,fcpMs:diagnostic.paint.find(p=>p.name==='first-contentful-paint')?.startTime,completedRequestCount:finished.length,completedWireBytes:finished.reduce((s,r)=>s+(r.encodedDataLength||0),0),apiRequests:finished.filter(r=>new URL(r.url).pathname.startsWith('/api/')),requests:finished,...diagnostic});
    if(sample===1){
     async function shot(state=label,fullPage=true){const file=`${out}/${state}-${viewport.width}x${viewport.height}${fullPage?'':'-viewport'}.png`;await page.screenshot({path:file,fullPage,animations:'disabled',caret:'initial'});report.screenshots.push({label:state,path,actor,viewport,file,httpStatus:response.status(),inspected:false});save();}
     await shot();
     if(label==='settings')await shot(label,false);
     if(label==='dashboard')for(const name of ['Credits','Project']){await page.getByRole('tab',{name,exact:true}).click();await page.getByRole('tabpanel',{name,exact:true}).waitFor();await shot('dashboard-'+name.toLowerCase());}
    }
   }catch(e){report.errors.push({label,path,sample,viewport,error:String(e)});}
   await context.close();save();console.log('DONE',label,viewport.width,sample);
  }
 }
}
await browser.close();report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({screenshots:report.screenshots.length,metrics:report.metrics.length,errors:report.errors,blocked:report.blocked}));
