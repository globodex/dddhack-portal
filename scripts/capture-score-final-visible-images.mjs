// Final-state GET-only supplemental screenshots after normal scrolling loads lazy images.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{chromium}from'@playwright/test';
const root='/workspace/dddhack-portal',out='evidence/score-reveal-current',origin='http://localhost:3000';
const report=JSON.parse(readFileSync(out+'/report.json'));assert.ok(!report.failure);assert.equal(report.phases.at(-1).mode,'unveil-all');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');for(const[file,sha]of Object.entries(report.sourceFiles))assert.equal(hash(readFileSync(root+'/'+file)),sha);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await context.route('**/*',r=>new URL(r.request().url()).origin!==origin||!['GET','HEAD'].includes(r.request().method())?r.abort():r.continue());const page=await context.newPage();
const supplement={source:report.source,readOnly:true,syntheticOnly:true,screenshots:[],checks:[]};
try{
 for(const viewport of[{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(origin+'/leaderboard',{waitUntil:'networkidle'});await page.locator('.projects-v6[data-hydrated="true"]').waitFor();assert.equal(await page.locator('.project-awards>p').count(),26);
  const height=await page.evaluate(()=>document.documentElement.scrollHeight);for(let y=0;y<height;y+=Math.floor(viewport.height*.7)){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForFunction(()=>[...document.images].filter(img=>{const b=img.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight;}).every(img=>img.complete&&img.naturalWidth>0));}
  await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>document.fonts.ready);
  for(const full of[true,false]){
   if(!full)await page.locator('.project-awards>p').last().scrollIntoViewIfNeeded();
   const file=`leaderboard-final-${full?'full':'last-rank'}-populated-${viewport.width}x${viewport.height}.png`;await page.screenshot({path:out+'/'+file,fullPage:full,animations:'disabled',style:'nextjs-portal{visibility:hidden!important}'});supplement.screenshots.push({file,viewport,fullPage:full,sha256:hash(readFileSync(out+'/'+file)),nativeOriginal:true});
  }
  const imageCounts=await page.evaluate(()=>({total:document.images.length,loaded:[...document.images].filter(img=>img.complete&&img.naturalWidth>0).length}));assert.equal(imageCounts.loaded,imageCounts.total);supplement.checks.push({viewport,allLazyImagesLoaded:true,imageCounts,passed:true});
 }
 for(const[file,sha]of Object.entries(report.sourceFiles))assert.equal(hash(readFileSync(root+'/'+file)),sha);
}catch(error){supplement.failure=String(error.stack||error);process.exitCode=1;}finally{await browser.close();writeFileSync(out+'/populated-images-report.json',JSON.stringify(supplement,null,2)+'\n');}
console.log(JSON.stringify({screenshots:supplement.screenshots.length,checks:supplement.checks.length,failure:supplement.failure}));
