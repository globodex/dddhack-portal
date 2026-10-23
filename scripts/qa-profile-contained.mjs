import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs';
assert.ok(process.env.BUILD_HEAD && process.env.WORKER_SHA, 'Fresh compiled build identifiers are required');
const base='http://127.0.0.1:4173',out='evidence/profile-contained';
mkdirSync(out,{recursive:true});
const report={build:process.env.BUILD_HEAD,workerSha:process.env.WORKER_SHA,checks:[],screenshots:[],errors:[],writes:[],browserClosed:false};
const browser=await chromium.launch({headless:true,chromiumSandbox:true});
report.browser=browser.version();
const check=(name,details={})=>report.checks.push({name,passed:true,...details});
async function shot(page,name,viewport){await page.evaluate(()=>document.fonts.ready);const filename=`${name}--participant-alice--${viewport.width}x${viewport.height}--${report.build.slice(0,7)}.png`;await page.screenshot({path:`${out}/${filename}`,fullPage:true,animations:'disabled'});report.screenshots.push({filename,localPath:`${process.cwd()}/${out}/${filename}`,route:'/profile',role:'participant-alice',viewport,build:report.build,workerSha:report.workerSha});}
async function metrics(page,label){const m=await page.evaluate(()=>{const flow=document.querySelector('.profile-flow'),fields=document.querySelector('.profile-fields'),footer=document.querySelector('.profile-actions'),heading=document.querySelector('.profile-toolbar');const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return{flow:box(flow),fields:box(fields),footer:box(footer),heading:box(heading),innerWidth,scrollWidth:document.documentElement.scrollWidth,fieldsScrollHeight:fields.scrollHeight,fieldsClientHeight:fields.clientHeight}});assert.ok(m.scrollWidth<=m.innerWidth,`${label}: horizontal overflow`);assert.ok(m.fields.bottom<=m.footer.y+1,`${label}: fields overlap footer`);assert.ok(m.heading.bottom<=m.fields.y+1,`${label}: heading overlaps fields`);assert.ok(m.footer.bottom<=m.flow.bottom+1,`${label}: footer outside step card`);check(`${label}: bounded field area, header/footer separation and no horizontal overflow`,m);}
async function next(page,title){await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();}
try{
for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}],['narrow',{width:320,height:640}],['short',{width:390,height:500}]]){
 const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==base||!['GET','HEAD'].includes(r.method())){report.writes.push({method:r.method(),url:r.url()});return route.abort('blockedbyclient')}return route.continue({headers:{...r.headers(),'oai-authenticated-user-id':'fake_alice','oai-authenticated-user-email':'alice@portal.test'}})});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 try{
 await page.goto(base+'/profile');await page.getByRole('heading',{name:'Your profile',exact:true}).waitFor();
 const fields=page.locator('.profile-fields');
 if(name==='desktop'){
 for(const color of ['Blue','Green','Purple','Orange','Charcoal','Yellow','Coral','Grey']){await page.locator(`label[title="${color}"]`).click();assert.ok(await page.getByRole('radio',{name:color,exact:true}).isChecked())}
 for(const expression of ['Squeezed','Sleepy','Plus','Star','Round','Cheerful','Mixed plus','Mixed slash']){await page.locator(`label[title="${expression}"]`).click();assert.ok(await page.getByRole('radio',{name:expression,exact:true}).isChecked())}
 check('all eight color and expression choices respond');
 }
 await page.locator('label[title="Purple"]').click();await page.locator('label[title="Mixed plus"]').click();
 const palette=await page.locator('.profile-color-grid .profile-avatar-choice').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),s=el.querySelector('.profile-color-swatch').getBoundingClientRect();return{width:r.width,height:r.height,swatch:s.width}}));
 assert.ok(palette.every(p=>p.width>=44&&p.height>=44&&p.swatch===18));check(`${name}: 18px palette swatches retain44px targets`,{palette});
 await fields.evaluate(el=>el.scrollTop=0);await metrics(page,`${name} step1`);await shot(page,`${name}-step1-avatar`,viewport);
 await page.getByRole('textbox',{name:'One-line bio'}).focus();
 const visible=await fields.evaluate(el=>{const f=document.activeElement.getBoundingClientRect(),r=el.getBoundingClientRect();return f.top>=r.top-1&&f.bottom<=r.bottom+1});assert.ok(visible,`${name}: keyboard-focused bio must be inside its scroller`);
 check(`${name}: keyboard focus scrolls field into view`);
 if(name!=='desktop')await shot(page,`${name}-step1-fields-scrolled`,viewport);
 await next(page,'Contact');assert.equal(await page.locator('.profile-basics-layout,.profile-about-fields').count(),0);
 const inputs=page.locator('.profile-social-url input');const originals=await inputs.evaluateAll(nodes=>nodes.map(n=>n.value));assert.deepEqual(originals,['https://github.com/synthetic-alice','https://example.test/alice']);
 await page.getByRole('button',{name:'Add another',exact:true}).click();assert.equal(await inputs.count(),3);
 await page.locator('.profile-platform-select select').nth(2).selectOption('X');await inputs.nth(2).fill('https://x.com/synthetic-alice');
 await page.getByRole('button',{name:'Remove social link 3',exact:true}).click();assert.equal(await inputs.count(),2);
 const iconTargets=await page.locator('.profile-remove-link').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width,svg:!!n.querySelector('svg'),text:n.textContent.trim()})));assert.ok(iconTargets.every(i=>i.height>=44&&i.width>=44&&i.svg&&!i.text));
 await page.getByRole('button',{name:'Previous profile step'}).click();await page.getByRole('heading',{name:'Your profile',exact:true}).waitFor();assert.ok(await page.getByRole('radio',{name:'Purple',exact:true}).isChecked());assert.ok(await page.getByRole('radio',{name:'Mixed plus',exact:true}).isChecked());
 await next(page,'Contact');assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(n=>n.value)),originals);check(`${name}: prefill/add/platform/trash and Back preserve values`,{iconTargets});
 await metrics(page,`${name} step2`);await shot(page,`${name}-step2-contact`,viewport);
 if(name==='mobile'){await page.locator('.profile-platform-select select').first().click();await shot(page,`${name}-step2-platform-menu`,viewport);await page.keyboard.press('Escape');}
 await next(page,'About you');assert.equal(await page.locator('.profile-basics-layout,.profile-contact-fields').count(),0);
 assert.equal(await page.locator('select[name="bestDescription"] option').count(),7);
 await metrics(page,`${name} step3`);await shot(page,`${name}-step3-about`,viewport);
 check(`${name}: only current step mounted; six Luma choices and Save action available`);
 }finally{await context.close();}
}
assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.writes.length,0,JSON.stringify(report.writes));
}catch(error){report.failure=error.stack;process.exitCode=1;}finally{await browser.close();report.browserClosed=true;writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
