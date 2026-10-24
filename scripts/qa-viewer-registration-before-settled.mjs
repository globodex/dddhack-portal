import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const origin='http://localhost:3008',out='evidence/viewer-registration/before';
const report={source:'d97d614ac7be2a657df91de42aaf00e9f3cfc336',syntheticOnly:true,reason:'Prior3 settled captures were still loading during development module compilation and are rejected as settled evidence.',cases:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
try{for(const [path,viewport] of [['/dashboard',{width:1440,height:900}],['/profile',{width:1440,height:900}],['/profile',{width:390,height:480}]]){
 const context=await browser.newContext({viewport,reducedMotion:'reduce',...(viewport.width<500?{isMobile:true,hasTouch:true}:{})});
 await context.addCookies([{name:'portal_local_fixture',value:'stranger',url:origin,httpOnly:true,sameSite:'Lax'}]);
 await context.route('**/*',r=>new URL(r.request().url()).origin!==origin||!['GET','HEAD'].includes(r.request().method())?r.abort('blockedbyclient'):r.continue());
 const page=await context.newPage();const item={path,viewport,responses:[],errors:[]};page.on('response',r=>item.responses.push({url:r.url(),status:r.status()}));page.on('pageerror',e=>item.errors.push(e.message));
 await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:120000});
 await page.getByRole('heading',{name:'Use your registered email',exact:true}).waitFor({timeout:60000});await page.evaluate(()=>document.fonts.ready);
 const file=`${out}/${path.slice(1)}-${viewport.width}x${viewport.height}-confirmed-mismatch.png`;await page.screenshot({path:file,fullPage:true,animations:'disabled'});
 Object.assign(item,{file,text:await page.locator('body').innerText(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});report.cases.push(item);await context.close();
}report.result='PASS_EXPECTED_BEFORE_BUG';}finally{await browser.close();report.browserClosed=true;writeFileSync(out+'/confirmed-settled-report.json',JSON.stringify(report,null,2));}
