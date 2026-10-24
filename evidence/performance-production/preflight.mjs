import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='evidence/performance-production/preflight';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false,proxy:{server:'http://127.0.0.1:8899'},args:['--host-resolver-rules=MAP portal-perf.test 127.0.0.1, MAP api.portal-perf.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','--disable-background-networking','--disable-sync']});
const report={syntheticOnly:true,readOnly:true,cases:[],errors:[]};
try{
 for(const [variant,port]of [['baseline',3443],['final',3444]]){
  const origin=`https://portal-perf.test:${port}`,context=await browser.newContext({viewport:{width:1440,height:900},ignoreHTTPSErrors:true,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addCookies([{name:'portal_local_fixture',value:'alice',url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
  const page=await context.newPage(),requests=[];page.on('request',q=>requests.push({method:q.method(),path:new URL(q.url()).pathname,url:q.url()}));page.on('pageerror',e=>report.errors.push({variant,error:e.message}));
  const response=await page.goto(origin+'/dashboard',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>{const e=document.getElementById('main');return e&&Object.keys(e).some(k=>k.startsWith('__reactFiber'));});
  const initialApi=requests.filter(q=>q.path.startsWith('/api/')),content=await page.locator('#main').innerText(),heading=await page.locator('h1').first().textContent();
  assert.equal(response.status(),200);assert.ok(heading);assert.ok(content.includes('Small Wonder'));assert.equal(initialApi.length,0);assert.ok(!requests.some(q=>!['GET','HEAD'].includes(q.method)));
  // Separate read-only transport proof, after measuring initial0API.
  const session=await page.evaluate(async()=>{const r=await fetch('/api/auth/session');return{status:r.status,body:await r.json()};});assert.equal(session.status,200);assert.equal(session.body.user?.id,'fake_alice');
  await page.screenshot({path:out+`/${variant}-dashboard.png`,fullPage:true,animations:'disabled'});
  report.cases.push({variant,httpStatus:response.status(),heading,initialApi,sessionTransport:session,requests,screenshot:`${variant}-dashboard.png`});
  await context.close();
 }
 assert.equal(report.errors.length,0);report.result='PASS';
}catch(error){report.errors.push({error:String(error)});report.result='FAIL';throw error;}finally{await browser.close();report.browserClosed=true;writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');}
