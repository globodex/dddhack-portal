// Actual pending Next navigations, gated on their existing RSC GET. No markup substitution.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
const cwd=process.cwd(),origin='http://127.0.0.1:3004',out=process.env.QA_LOADING_OUTPUT||'evidence/final-performance-current/loading';mkdirSync(out,{recursive:true});
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report={source,origin,syntheticOnly:true,readOnly:true,method:'Hold only existing destination RSC GET after a real prefetch=false navigation link; capture actual pending RouteSkeleton. No DOM replacement or injected app styles.',cases:[],errors:[],blocked:[]};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
 for(const [label,target,linkName,layout,bootstrap,actor] of [['studio','/dashboard','Dashboard','dashboard','/discover/participants','alice'],['inventory','/admin/credits','Credits','credits','/admin/participants','owner'],['personal','/personal/credits','My credits','personal-credits','/admin/participants','owner']]){
  if(process.env.LOADING_STUDIO_ONLY==='1'&&label!=='studio')continue;
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  let release;const held=new Promise(resolve=>release=resolve),row={label,target,layout,gatedRequests:[],apiRequests:[],screenshots:[],geometry:[]};report.cases.push(row);
  await context.addCookies([{name:'portal_local_fixture',value:actor,url:origin,httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin||!['GET','HEAD'].includes(request.method())){report.blocked.push({method:request.method(),path:url.pathname});save();return route.abort('blockedbyclient');}
   if(url.pathname.startsWith('/api/'))row.apiRequests.push({method:request.method(),path:url.pathname,search:url.search});
   if(url.pathname===target&&(url.searchParams.has('_rsc')||request.headers()['rsc']==='1')){row.gatedRequests.push({method:request.method(),path:url.pathname,rsc:true});save();await held;}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push({label,message:error.message}));page.setDefaultTimeout(15000);
  try{
   await page.goto(origin+bootstrap,{waitUntil:'networkidle',timeout:60000});await page.locator('.app-shell[data-hydrated=true]').waitFor();
   const link=page.getByRole('link',{name:linkName,exact:true});await link.click();
   const skeleton=page.locator(`.route-skeleton[data-layout="${layout}"]`);await skeleton.waitFor();
   for(const viewport of (process.env.LOADING_STUDIO_ONLY==='1'?[{width:390,height:844},{width:320,height:480}]:[{width:1440,height:900},{width:390,height:844},{width:320,height:480}])){
    await page.setViewportSize(viewport);await page.evaluate(()=>document.fonts.ready);
    const geometry=await skeleton.evaluate(element=>{const s=getComputedStyle(element);return{layout:element.getAttribute('data-layout'),busy:element.getAttribute('aria-busy'),hiddenShapes:element.querySelector('.route-skeleton-shapes')?.getAttribute('aria-hidden'),scrollWidth:document.documentElement.scrollWidth,innerWidth,rect:element.getBoundingClientRect().toJSON(),display:s.display};});
    row.geometry.push({viewport,...geometry});
    if(process.env.LOADING_STUDIO_ONLY==='1'){const tops=await skeleton.locator('.route-skeleton-tabs').first().locator('>span').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));assert.equal(new Set(tops.map(Math.round)).size,1,'Three loading tabs must share one row');row.tabTops=(row.tabTops||[]).concat([{viewport,tops}]);}
    const file=`${label}-${viewport.width}x${viewport.height}.png`;await page.screenshot({path:out+'/'+file,fullPage:true,animations:'disabled',style:'nextjs-portal{visibility:hidden!important}'});row.screenshots.push({file,viewport,fullPage:true,inspected:false});save();
    assert.ok(geometry.scrollWidth<=geometry.innerWidth,'Loading controls must stay insideviewport');
   }
   assert.equal(row.gatedRequests.length,1,'Exactly the existing navigation RSC GET is held');assert.equal(row.apiRequests.length,0,'Loading markup adds no browser data request');
  }finally{
   const released=row.gatedRequests.length?page.waitForResponse(response=>{const u=new URL(response.url());return u.pathname===target&&(u.searchParams.has('_rsc')||response.request().headers()['rsc']==='1');},{timeout:60000}).then(response=>{row.releasedStatus=response.status();},error=>{row.releaseError=String(error);report.errors.push({label,message:row.releaseError});}):Promise.resolve();
   release();await released;await context.close();
  }
 }
 assert.equal(report.errors.length,0);assert.equal(report.blocked.length,0);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();report.browserClosed=true;save();}
console.log(JSON.stringify({result:report.result,cases:report.cases.length,errors:report.errors.length,blocked:report.blocked.length,failure:report.failure}));
