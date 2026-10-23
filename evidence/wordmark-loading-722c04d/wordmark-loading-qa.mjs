// Read-only compiled preview test. Every outbound request is allowlisted to the exact loopback origin.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const {chromium}=await import('/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs');
const origin='http://127.0.0.1:4173',out=process.cwd()+'/evidence/public-home-approved/wordmark-loading';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'/tmp/ddehack-playwright-browsers/chromium-1248/chrome-linux64/chrome'});
const report={source:process.env.PUBLIC_HOME_QA_SOURCE,workerSHA:process.env.PUBLIC_HOME_QA_WORKER,browser:browser.version(),sandbox:true,cachePolicy:'Playwright route allowlist disables HTTP cache; before/after use same policy',cases:[],pageErrors:[]};
const state=page=>page.evaluate(()=>{const root=document.querySelector('.delhi-wordmark'),fallback=root.querySelector('.delhi-fallback'),fill=root.querySelector('.delhi-fill'),mask=root.querySelector('.delhi-mask'),metro=root.querySelector('.delhi-metro');return{motion:root.dataset.motion,coarse:matchMedia('(pointer: coarse)').matches,hoverNone:matchMedia('(hover: none)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,fallbackVisible:getComputedStyle(fallback).visibility,fallbackComplete:fallback.complete&&fallback.naturalWidth===2048,fill:!!fill,mask:!!mask,metro:!!metro,fillTransform:fill?.style.transform||'',metroTransform:metro?getComputedStyle(metro).transform:null,maskTransform:mask?getComputedStyle(mask).transform:null,width:root.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth};});
const resources=page=>page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/art/delhi-v3/')).map(r=>({file:r.name.split('/').pop(),transferSize:r.transferSize,encodedBodySize:r.encodedBodySize})));
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
async function setup({width=1440,height=900,touch=false,reduced=false,failure=false,delay=false,delayMask=false}={}){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',hasTouch:touch,isMobile:touch,reducedMotion:reduced?'reduce':'no-preference'});
 const requests=[];
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin||!['GET','HEAD','OPTIONS'].includes(req.method()))return route.abort('blockedbyclient');
  if(url.pathname.startsWith('/art/delhi-v3/'))requests.push({file:url.pathname.split('/').pop(),at:Date.now()});
  if(failure&&url.pathname.endsWith('/delhi-fill-overscan.png'))return route.abort('failed');
  if((delay&&url.pathname.endsWith('/delhi-fill-overscan.png'))||(delayMask&&url.pathname.endsWith('/text-mask-alpha.png')))await new Promise(resolve=>setTimeout(resolve,1500));
  return route.continue();});
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(String(error)));
 return{context,page,requests};
}
try{
 for(const spec of [{name:'desktop-fine',width:1440},{name:'phone-coarse',width:390,height:844,touch:true},{name:'desktop-reduced',reduced:true},{name:'narrow-fine',width:390,height:844},{name:'failed-fill',failure:true}]){
  const {context,page,requests}=await setup(spec);await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
  const result={name:spec.name,initial:await state(page),resources:await resources(page),requests};
  result.encodedBytes=result.resources.reduce((sum,r)=>sum+r.encodedBodySize,0);result.transferBytes=result.resources.reduce((sum,r)=>sum+r.transferSize,0);
  if(spec.name==='desktop-fine'){
   const box=await page.locator('.delhi-wordmark').boundingBox();await page.mouse.move(box.x+box.width-1,box.y+box.height-1);await page.waitForTimeout(200);result.pointer=await state(page);
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);result.resized=await state(page);await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);result.reduced=await state(page);
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(200);result.resumedMedia=await state(page);
   await page.getByRole('button',{name:'Pause animations'}).click();await page.waitForTimeout(100);result.paused=await state(page);
   await page.getByRole('button',{name:'Resume animations'}).click();await page.waitForTimeout(200);result.resumedPause=await state(page);
   const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await page.waitForTimeout(200);result.pointerCoarseTransition=await state(page);
   await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await page.waitForTimeout(200);result.pointerFineTransition=await state(page);await cdp.detach();
   await page.locator('.organizers').scrollIntoViewIfNeeded();await page.waitForTimeout(150);result.heroOffscreen=await state(page);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);result.heroReturned=await state(page);
   result.resourcesAfterChanges=await resources(page);
  }
  report.cases.push(result);save();await context.close();
 }
 const {context,page,requests}=await setup({delay:true});await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForTimeout(250);const slow={name:'delayed-fill',during:await state(page)};await page.waitForLoadState('networkidle');await page.waitForTimeout(150);slow.after=await state(page);slow.requests=requests;report.cases.push(slow);await context.close();
 const maskCase=await setup({delayMask:true});await maskCase.page.goto(origin,{waitUntil:'domcontentloaded'});await maskCase.page.waitForFunction(()=>document.querySelector('.delhi-wordmark').dataset.motion==='true');const maskResult={name:'delayed-mask',atReveal:await state(maskCase.page),requestsAtReveal:[...maskCase.requests]};await maskCase.page.locator('.delhi-wordmark').screenshot({path:'/tmp/wordmark-delayed-mask-at-reveal.png'});await maskCase.page.waitForLoadState('networkidle');maskResult.after=await state(maskCase.page);maskResult.requests=maskCase.requests;report.cases.push(maskResult);await maskCase.context.close();
 const baseline=JSON.parse(readFileSync(process.cwd()+'/evidence/public-home-approved/rendered/report.json','utf8'));
 report.before=baseline.viewports.filter(v=>(v.width===1440&&v.height===900)||v.width===390).map(v=>({source:baseline.source,width:v.width,resources:v.assets,encodedBytes:v.assets.reduce((sum,r)=>sum+r.encodedBodySize,0),transferBytes:v.assets.reduce((sum,r)=>sum+r.transferSize,0)}));
}finally{await browser.close();report.browserClosed=true;save();}
console.log(JSON.stringify(report,null,2));
