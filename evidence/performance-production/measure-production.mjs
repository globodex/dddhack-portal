import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const out='evidence/performance-production';mkdirSync(out,{recursive:true});
const variants={baseline:{origin:'https://portal-perf.test:3443',root:'/workspace/ddd-perf-prod-baseline'},final:{origin:'https://portal-perf.test:3444',root:'/workspace/ddd-perf-prod-final'}};
for(const value of Object.values(variants))value.source=execFileSync('git',['rev-parse','HEAD'],{cwd:value.root,encoding:'utf8'}).trim();
const routes=[['dashboard','/dashboard'],['people','/discover/participants']];
const report={startedAt:new Date().toISOString(),variants,mode:'next build --webpack / next start; unmodified production application',backend:'Baseline696 backend8851 from a verified exact COPY of original synthetic8789 fixture, behind read-only verified TLS proxy',identity:'Synthetic Alice fixture cookie projected by original local backend, not Google sign-in verification',browser:'Chromium isolated context; native sandbox unavailable; exact fixture-only CONNECT proxy',samples:[],serverCold:[],warmup:[],screenshots:[],errors:[],externalAttempts:[],method:{viewport:{width:1440,height:900},rounds:7,order:'Alternate variant order each round; both routes each round',cold:'Fresh browser context, HTTP cache disabled. Warm application server.',repeat:'Same context: enable HTTP cache, prime one identical reload (excluded), then measured repeat reload. No Playwright routing/interception disables cache.',serverCold:'One first navigation per variant recorded separately before any warm-up; n1 each, not mixed into medians.',warmup:'One identical cache-disabled GET per route per variant after server-cold samples, before matrix.',lcp:'Last observed LCP candidate at sample time; not field Core Web Vitals.',statistics:'Median and nearest-rank p95, n7 per route/variant/cache state; descriptive tail max, not population estimate.'}};
const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false,proxy:{server:'http://127.0.0.1:8899'},args:['--host-resolver-rules=MAP portal-perf.test 127.0.0.1, MAP api.portal-perf.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','--disable-background-networking','--disable-component-update','--disable-sync']});
let seq=0;
async function contextFor(variant){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',ignoreHTTPSErrors:true,serviceWorkers:'block'});
 await context.addCookies([{name:'portal_local_fixture',value:'alice',url:variants[variant].origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
 await context.addInitScript(()=>{window.__qa={lcp:[],longtasks:[]};try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qa.lcp.push({startTime:e.startTime,renderTime:e.renderTime,loadTime:e.loadTime,size:e.size,url:e.url,tag:e.element?.tagName,text:e.element?.textContent?.slice(0,160)});}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qa.longtasks.push({startTime:e.startTime,duration:e.duration,name:e.name});}).observe({type:'longtask',buffered:true});}catch(error){window.__qa.observerError=String(error);}});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push({variant,error:e.message}));
 page.on('request',q=>{if(new URL(q.url()).origin!==variants[variant].origin||!['GET','HEAD'].includes(q.method()))report.externalAttempts.push({variant,url:q.url(),method:q.method()});});
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 return {context,page,cdp};
}
async function measure(session,variant,label,path,phase,round,reload=false){
 const {page,cdp}=session,requests=new Map(),finished=[];const id=++seq;
 const onRequest=p=>requests.set(p.requestId,{id:p.requestId,url:p.request.url,method:p.request.method,type:p.type,start:p.timestamp,initiator:p.initiator.type,priority:p.request.initialPriority});
 const onResponse=p=>{const row=requests.get(p.requestId);if(row)Object.assign(row,{status:p.response.status,mime:p.response.mimeType,fromDiskCache:!!p.response.fromDiskCache,fromServiceWorker:!!p.response.fromServiceWorker,protocol:p.response.protocol,timing:p.response.timing,responseHeaders:p.response.headers});};
 const onCache=p=>{const row=requests.get(p.requestId);if(row)row.servedFromCache=true;};
 const onFinished=p=>{const row=requests.get(p.requestId);if(row){row.encodedDataLength=p.encodedDataLength;row.durationMs=(p.timestamp-row.start)*1000;finished.push(row);}};
 cdp.on('Network.requestWillBeSent',onRequest);cdp.on('Network.responseReceived',onResponse);cdp.on('Network.requestServedFromCache',onCache);cdp.on('Network.loadingFinished',onFinished);
 try{
 const start=Date.now();const response=reload?await page.reload({waitUntil:'networkidle',timeout:60000}):await page.goto(variants[variant].origin+path,{waitUntil:'networkidle',timeout:60000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>{const el=document.getElementById('main');return el&&Object.keys(el).some(k=>k.startsWith('__reactFiber'));});await page.waitForTimeout(200);
 const d=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0],p=performance.getEntriesByType('paint'),main=document.getElementById('main');return{navigation:n.toJSON(),paint:p.map(x=>x.toJSON()),resources:performance.getEntriesByType('resource').map(x=>x.toJSON()),ttfbMs:n.responseStart-n.requestStart,fcpMs:p.find(x=>x.name==='first-contentful-paint')?.startTime,lcp:window.__qa.lcp.at(-1)||null,longtasks:window.__qa.longtasks,observerError:window.__qa.observerError,heading:document.querySelector('h1')?.textContent,domNodes:document.querySelectorAll('*').length,mainText:main?.textContent?.slice(0,2000),mainBox:main?{width:main.getBoundingClientRect().width,height:main.getBoundingClientRect().height}:null,documentWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth,fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),bodyFont:getComputedStyle(document.body).fontFamily,headingStyle:document.querySelector('h1')?{font:getComputedStyle(document.querySelector('h1')).fontFamily,weight:getComputedStyle(document.querySelector('h1')).fontWeight,size:getComputedStyle(document.querySelector('h1')).fontSize}:null};});
 assert.equal(response.status(),200);assert.ok(d.heading,'SSR main heading required');assert.ok(!/temporarily unavailable|BACKEND_UNAVAILABLE|LOCAL_ADAPTER_DISABLED|NEON_API_ORIGIN_INVALID/.test(d.mainText||''),'No backend or adapter error shell');
 const row={id,variant,label,path,phase,round,httpStatus:response.status(),elapsedToSampleMs:Date.now()-start,completedRequestCount:finished.length,completedWireBytes:finished.reduce((n,x)=>n+(x.encodedDataLength||0),0),actualNetworkRequests:finished.filter(x=>!x.servedFromCache&&!x.fromDiskCache).length,cachedRequests:finished.filter(x=>x.servedFromCache||x.fromDiskCache).length,fontsRequested:finished.filter(x=>x.type==='Font').length,fontWireBytes:finished.filter(x=>x.type==='Font').reduce((n,x)=>n+(x.encodedDataLength||0),0),initialApiRequests:finished.filter(x=>new URL(x.url).pathname.startsWith('/api/')).length,requests:finished,...d};
 if(phase==='server-cold')report.serverCold.push(row);else if(phase==='warmup'||phase==='prime')report.warmup.push(row);else report.samples.push(row);
 if(phase==='cold'&&round===1){const file=`${variant}-${label}-1440x900.png`;await page.screenshot({path:out+'/'+file,fullPage:true,animations:'disabled'});report.screenshots.push({variant,label,file,inspected:false});}
 save();console.log(JSON.stringify({id,variant,label,phase,round,ttfb:row.ttfbMs,fcp:row.fcpMs,lcp:row.lcp?.startTime,wire:row.completedWireBytes,cache:row.cachedRequests}));return row;
 }finally{cdp.off('Network.requestWillBeSent',onRequest);cdp.off('Network.responseReceived',onResponse);cdp.off('Network.requestServedFromCache',onCache);cdp.off('Network.loadingFinished',onFinished);}
}
try{
 for(const variant of ['baseline','final']){const s=await contextFor(variant);await s.cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await measure(s,variant,'dashboard','/dashboard','server-cold',0);await s.context.close();}
 for(const variant of ['baseline','final'])for(const[label,path]of routes){const s=await contextFor(variant);await s.cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await measure(s,variant,label,path,'warmup',0);await s.context.close();}
 for(let round=1;round<=7;round++)for(const[label,path]of routes)for(const variant of(round%2?['baseline','final']:['final','baseline'])){
  const s=await contextFor(variant);try{await s.cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await measure(s,variant,label,path,'cold',round);await s.cdp.send('Network.setCacheDisabled',{cacheDisabled:false});await measure(s,variant,label,path,'prime',round,true);await measure(s,variant,label,path,'repeat',round,true);}finally{await s.context.close();}
 }
 assert.equal(report.samples.length,56);assert.equal(report.errors.length,0);assert.equal(report.externalAttempts.length,0);
 assert.ok(report.samples.filter(x=>x.phase==='repeat').every(x=>x.cachedRequests>0),'Repeat must actually hit native HTTP cache');
 report.result='PASS56';
}catch(error){report.errors.push({error:String(error),stack:error.stack});report.result='FAIL';throw error;}finally{await browser.close();report.browserClosed=true;report.finishedAt=new Date().toISOString();save();}
