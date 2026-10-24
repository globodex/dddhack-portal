// One cold-load trace per source for attribution only; not added to timing matrix.
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const out='evidence/performance-production';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false,proxy:{server:'http://127.0.0.1:8899'},args:['--host-resolver-rules=MAP portal-perf.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-background-networking','--disable-sync']});
const report={method:'One cache-disabled Dashboard Chrome timeline trace per variant, warm server. Tracing overhead means these are attribution diagnostics, not extra comparable performance samples.',cases:[],errors:[]};
try{for(const [variant,port]of [['baseline',3443],['final',3444]]){
 const origin=`https://portal-perf.test:${port}`,context=await browser.newContext({viewport:{width:1440,height:900},ignoreHTTPSErrors:true,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addCookies([{name:'portal_local_fixture',value:'alice',url:origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
 const page=await context.newPage(),cdp=await context.newCDPSession(page);page.on('pageerror',e=>report.errors.push({variant,error:e.message}));
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-devtools.timeline,disabled-by-default-v8.compile',transferMode:'ReturnAsStream'});
 await page.goto(origin+'/dashboard',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>{const e=document.getElementById('main');return e&&Object.keys(e).some(k=>k.startsWith('__reactFiber'));});await page.waitForTimeout(200);
 const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await complete;let raw='';for(;;){const row=await cdp.send('IO.read',{handle:stream});raw+=row.data;if(row.eof)break;}await cdp.send('IO.close',{handle:stream});
 const file=`${variant}-dashboard-timeline.json.gz`;writeFileSync(out+'/'+file,gzipSync(raw));report.cases.push({variant,file,events:JSON.parse(raw).traceEvents.length});await context.close();
}}finally{await browser.close();report.browserClosed=true;writeFileSync(out+'/cpu-profile-report.json',JSON.stringify(report,null,2)+'\n');}
