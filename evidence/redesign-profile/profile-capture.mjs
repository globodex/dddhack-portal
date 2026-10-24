import { chromium } from '/workspace/dddhack-portal/node_modules/@playwright/test/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const root = process.env.PROFILE_EVIDENCE || '/workspace/profile-evidence/before';
const origin = process.env.PROFILE_ORIGIN || 'http://127.0.0.1:3000';
mkdirSync(root,{recursive:true});
const report={origin,syntheticOnly:true,source:process.env.PROFILE_SOURCE||'696b125f9711a4fd6e02c3ece3adadb18b83cba7',captures:[],errors:[]};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844},{width:390,height:480}]){
 const context=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width===390,isMobile:viewport.width===390,serviceWorkers:'block'});
 await context.addCookies([{name:'portal_local_fixture',value:'alice',url:origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',r=>{const q=r.request(); if(new URL(q.url()).origin!==origin||!['GET','HEAD'].includes(q.method())) return r.abort('blockedbyclient'); return r.continue();});
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/profile',{waitUntil:'networkidle'});
 await page.locator('.profile-flow[data-step="1"]').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 for(let step=1;step<=3;step++){
  await page.locator(`.profile-flow[data-step="${step}"]`).waitFor();
  await page.screenshot({path:`${root}/profile-step-${step}-${viewport.width}x${viewport.height}.png`,fullPage:true,animations:'disabled'});
  const observation=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1')?.textContent,fieldRegion:document.querySelector('.profile-fields')?.getBoundingClientRect().toJSON(),fields:[...document.querySelectorAll('.profile-fields input,.profile-fields select')].map(n=>({name:n.name,type:n.type,value:n.value,checked:n.checked})),scrollHeight:document.documentElement.scrollHeight}));
  report.captures.push({viewport,step,path:`${root}/profile-step-${step}-${viewport.width}x${viewport.height}.png`,...observation});
  if(step<3) await page.getByRole('button',{name:'Next',exact:true}).click();
 }
 if(viewport.width===390 && viewport.height===844) {
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('dialog',{name:'Navigation',exact:true}).waitFor();
  await page.screenshot({path:`${root}/profile-mobile-navigation-390x844.png`,fullPage:false,animations:'disabled'});
  report.navigation={path:`${root}/profile-mobile-navigation-390x844.png`,viewport};
  await page.keyboard.press('Escape');
 }
 await context.close();
}
await browser.close();
writeFileSync(root+'/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({root,captures:report.captures.length,errors:report.errors},null,2));
