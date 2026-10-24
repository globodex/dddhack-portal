// Read-only browser QA plus a temporary, clearly labelled agenda in our own SQLite fixture.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import cp from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { defaultPublicContent } from '../lib/public-content-defaults.ts';

const origin='http://127.0.0.1:3009',out='evidence/mobile-stack-final/verified';
const resume=process.env.STACK_QA_RESUME==='1';
const dbPath='/tmp/ddd-mobile-stack-212b.sqlite';
fs.mkdirSync(out,{recursive:true});
const report={source:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),syntheticOnly:true,checks:[],states:[],captures:[],errors:[],limits:['Local functional and geometry checks only; no hosted or performance claim.','Only the owned temporary SQLite event_content fixture is changed for the labelled long-agenda test, then restored.']};
const save=()=>fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const check=(name,passed,details={})=>{report.checks.push({name,passed,...details});save();if(!passed)throw new Error(name);};
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:false});
const contexts=[];
async function load(width,height,reduced=false){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<741,hasTouch:width<741,deviceScaleFactor:1,reducedMotion:reduced?'reduce':'no-preference',serviceWorkers:'block'});contexts.push(context);
  await context.route('**/*',route=>{const q=route.request();return new URL(q.url()).origin===origin&&['GET','HEAD'].includes(q.method())?route.continue():route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{report.errors.push(e.message);save();});
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('.chapter-stack[data-enhanced]').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.complete||i.loading!=='lazy').map(i=>i.decode().catch(()=>{})));});
  await page.waitForTimeout(150);
  const flow=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.chapter')].map(e=>[e.id,e.getBoundingClientRect().top+scrollY])));
  return{context,page,flow};
}
async function state(page,label){const value=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{id:e.id,top:r.top,bottom:r.bottom,height:r.height,width:r.width,position:s.position,stickyTop:parseFloat(s.top),z:s.zIndex};};return{viewport:{width:innerWidth,height:innerHeight},scrollY,documentWidth:document.documentElement.scrollWidth,header:box(document.querySelector('.public-header')),mobileStack:document.querySelector('.chapter-stack').dataset.mobileStack,enhanced:document.querySelector('.chapter-stack').dataset.enhanced,chapters:[...document.querySelectorAll('.chapter')].map(box)};});report.states.push({label,...value});save();return value;}
async function shot(page,label){const path=`${out}/${label}.png`;await page.screenshot({path,animations:'disabled'});report.captures.push(path);save();}
async function scroll(page,y){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.waitForTimeout(80);}
async function inspectHero(page,key){
  await scroll(page,0);await shot(page,`${key}-hero`);
  const result=await page.evaluate(()=>{const logo=document.querySelector('.hero-partner img'),r=logo.getBoundingClientRect(),host=document.querySelector('.hero-host').getBoundingClientRect(),cta=document.querySelector('.primary-cta'),c=cta.getBoundingClientRect(),point=document.elementFromPoint(c.x+c.width/2,c.y+c.height/2);return{logo:{width:r.width,height:r.height,naturalWidth:logo.naturalWidth,naturalHeight:logo.naturalHeight,top:r.top},hostBottom:host.bottom,cta:{top:c.top,bottom:c.bottom,height:c.height,visible:c.bottom<=innerHeight,hit:point===cta||cta.contains(point)},overflow:document.documentElement.scrollWidth>innerWidth};});
  check(`${key} official logo below host, natural aspect and no overflow`,result.logo.naturalWidth===360&&result.logo.height===26&&result.logo.top>=result.hostBottom&&!result.overflow,result);
  if(key==='390x844')check(`${key} thumb CTA visible and unobstructed`,result.cta.visible&&result.cta.hit&&result.cta.height>=44,result.cta);
}
async function verifyRules(page,flow,key){
  const pin=await page.locator('#rules').evaluate(e=>parseFloat(getComputedStyle(e).top));
  const rows=page.locator('#rules li');
  for(let i=0;i<await rows.count();i++){const row=rows.nth(i),offset=await row.evaluate(e=>e.getBoundingClientRect().top-document.querySelector('#rules').getBoundingClientRect().top);await scroll(page,Math.min(flow.rules+offset-84,flow.rules-pin));const r=await row.evaluate(e=>{const b=e.getBoundingClientRect(),p=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{top:b.top,bottom:b.bottom,hit:p===e||e.contains(p)};});check(`${key} rule ${i+1} readable before incoming FAQ`,r.top>=64&&r.bottom<=Number(key.split('x')[1])&&r.hit,r);if(i===7)await shot(page,`${key}-rules-last-row-visible`);}
}
let originalRow;
try{
  for(const height of (resume?[480]:[844,480])){
    const key=`390x${height}`,{page,context,flow}=await load(390,height);await inspectHero(page,key);
    const initial=await state(page,`${key}-initial`);check(`${key} mobile stack enabled`,initial.mobileStack==='true'&&initial.chapters.every(c=>c.position==='sticky'),initial);
    for(const id of ['schedule','venue','rules','faq']){await scroll(page,flow[id]-78);await shot(page,`${key}-${id}-start`);}
    for(const [previous,next] of [['schedule','venue'],['venue','rules'],['rules','faq']]){
      const geometry=await page.locator(`#${previous}`).evaluate(e=>({height:e.getBoundingClientRect().height,top:parseFloat(getComputedStyle(e).top)}));
      const incoming=Math.min(height-36,geometry.top+geometry.height-24);
      await scroll(page,flow[next]-incoming);const first=await state(page,`${key}-${previous}-${next}-progress1`);
      await scroll(page,flow[next]-incoming+120);const second=await state(page,`${key}-${previous}-${next}-progress2`);
      const a=first.chapters.find(c=>c.id===previous),b=second.chapters.find(c=>c.id===previous),n1=first.chapters.find(c=>c.id===next),n2=second.chapters.find(c=>c.id===next);
      check(`${key} ${next} overlaps pinned ${previous} through native scroll`,Math.abs(a.top-b.top)<1&&n1.top-n2.top>110&&b.bottom>n2.top&&Number(n2.z)>Number(b.z),{firstPrevious:a,secondPrevious:b,firstIncoming:n1,secondIncoming:n2});
      await shot(page,`${key}-${previous}-to-${next}-overlap`);
    }
    if(height===480){const rules=initial.chapters.find(c=>c.id==='rules');check('short Rules uses bottom pin without clipping natural height',rules.stickyTop<0&&rules.height>=711&&Math.abs(rules.stickyTop+Math.ceil(rules.height)-(height-16))<1,rules);}
    await scroll(page,flow.schedule-78);const before=await page.evaluate(()=>scrollY),cdp=await context.newCDPSession(page);const y=height-100;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y}]});
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y:y-i*30}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);const after=await page.evaluate(()=>scrollY);check(`${key} native finger swipe scrolls document`,after>before+100,{before,after});await shot(page,`${key}-after-touch-swipe`);
    await verifyRules(page,flow,key);
    await scroll(page,flow.faq-78);const summaries=page.locator('#faq summary');for(let i=0;i<await summaries.count();i++){const item=summaries.nth(i);await item.focus();const isOpen=await item.evaluate(e=>e.parentElement.open);if(!isOpen)await page.keyboard.press('Enter');}
    await page.waitForTimeout(180);const expanded=await state(page,`${key}-faq-expanded`);const faq=expanded.chapters.find(c=>c.id==='faq');check(`${key} expanded FAQ height recomputes safe pin`,faq.height>700&&faq.stickyTop<=height-faq.height-15,{faq});
    const last=summaries.last();await last.focus();await last.scrollIntoViewIfNeeded();const focus=await last.evaluate(e=>{const r=e.getBoundingClientRect(),header=document.querySelector('.public-header').getBoundingClientRect(),point=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{focused:document.activeElement===e,top:r.top,bottom:r.bottom,headerBottom:header.bottom,hit:e===point||e.contains(point)};});check(`${key} keyboard-focused last FAQ remains visible and hittable`,focus.focused&&focus.top>=focus.headerBottom&&focus.bottom<=height&&focus.hit,focus);await shot(page,`${key}-faq-expanded-last-focused`);
    await scroll(page,0);const cta=page.locator('.primary-cta');await cta.focus();await page.keyboard.press('Enter');await page.waitForURL(url=>url.pathname==='/signin',{timeout:60000,waitUntil:'domcontentloaded'});check(`${key} keyboard CTA reaches sign-in without auth send`,new URL(page.url()).pathname==='/signin');await context.close();
  }
  if(resume){report.priorNormalEvidence={report:'../verified-normal-first-run/report.json',acceptedFunctionalChecks:9,harnessFailure:'URLregex rejected valid signin?returnTo query; source navigation completed200',sourceUnchanged:true};const {page,context,flow}=await load(390,844);await verifyRules(page,flow,'390x844');await scroll(page,0);await page.locator('.primary-cta').focus();await page.keyboard.press('Enter');await page.waitForURL(url=>url.pathname==='/signin',{timeout:60000,waitUntil:'domcontentloaded'});check('390x844 keyboard CTA reaches sign-in with return path',new URL(page.url()).pathname==='/signin'&&new URL(page.url()).searchParams.get('returnTo')==='/dashboard');await context.close();}
  for(const height of [844,480]){const key=`390x${height}-reduced`,{page,context,flow}=await load(390,height,true);await scroll(page,flow.rules-78);const reduced=await state(page,key);check(`${key} ordinary readable motion fallback`,reduced.enhanced==='false'&&reduced.chapters.every(c=>c.position==='relative'),reduced);await shot(page,key);await context.close();}
  const paused=await load(390,844);await paused.page.getByRole('button',{name:'Pause animations',exact:true}).click();await paused.page.waitForTimeout(100);await scroll(paused.page,paused.flow.rules-78);const pauseState=await state(paused.page,'390x844-paused');check('pause uses ordinary chapter scroll',pauseState.enhanced==='false'&&pauseState.chapters.every(c=>c.position==='relative'));await shot(paused.page,'390x844-paused');await paused.context.close();
  for(const [width,height] of [[768,1024],[1440,900]]){const {page,context}=await load(width,height);await inspectHero(page,`${width}x${height}`);await context.close();}
  const db=new DatabaseSync(dbPath);originalRow=db.prepare('SELECT * FROM event_content WHERE id=1').get();const content={...defaultPublicContent,agenda:Array.from({length:6},(_,i)=>({time:`QA slot ${i+1}`,title:`Synthetic agenda row ${i+1}`,description:'Local synthetic QA content only. '.repeat(4)+'https://example.test/'+('long-url-'.repeat(8))}))};const serialized=JSON.stringify(content);db.prepare('INSERT INTO event_content(id,draft,published,revision,updated_at) VALUES(1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft,published=excluded.published').run(serialized,serialized,'2026-10-24T00:00:00Z');db.close();report.syntheticAgenda={temporaryOwnedFixture:dbPath,rows:6,contentChangedInApplication:false,labels:'QA slot / Synthetic agenda row'};save();
  for(const height of [844,480]){const key=`390x${height}-synthetic-long-agenda`,{page,context,flow}=await load(390,height);check(`${key} all six published fixture rows rendered`,await page.locator('.agenda-timeline>li').count()===6);const pin=await page.locator('#schedule').evaluate(e=>parseFloat(getComputedStyle(e).top));check(`${key} tall agenda receives negative bottom pin`,pin<0,{pin});for(let i=0;i<6;i++){const row=page.locator(`#agenda-${i}`),offset=await row.evaluate(e=>e.getBoundingClientRect().top-document.querySelector('#schedule').getBoundingClientRect().top);await scroll(page,Math.min(flow.schedule+offset-84,flow.schedule-pin));const r=await row.evaluate(e=>{const b=e.getBoundingClientRect();const p=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{top:b.top,bottom:b.bottom,hit:e===p||e.contains(p)};});check(`${key} row ${i+1} readable before next card covers it`,r.top>=64&&r.bottom<=height&&r.hit,r);if(i===0||i===5)await shot(page,`${key}-row-${i+1}`);}await context.close();}
}catch(error){report.failure=String(error.stack||error);save();}finally{
  if(originalRow!==undefined||report.syntheticAgenda){const db=new DatabaseSync(dbPath);db.prepare('DELETE FROM event_content WHERE id=1').run();if(originalRow){const keys=Object.keys(originalRow);db.prepare(`INSERT INTO event_content(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>originalRow[k]));}db.close();report.syntheticAgendaRestored=true;}
  await Promise.allSettled(contexts.map(c=>c.close()));await browser.close();report.browserClosed=true;save();
}
console.log(JSON.stringify({source:report.source,checks:report.checks.length,failed:report.checks.filter(c=>!c.passed),captures:report.captures.length,errors:report.errors,failure:report.failure,browserClosed:report.browserClosed}));if(report.failure||report.errors.length)process.exitCode=1;
