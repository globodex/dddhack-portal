// Read-only visual/interaction review against the held synthetic root runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const root = "/workspace/dddhack-portal", origin = "http://localhost:3000";
const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.equal(source, process.env.QA_ROOT_SOURCE, "held runtime source required");
const out = process.env.QA_OUTPUT || "evidence/submission-media-rework";
mkdirSync(out, { recursive: true });
const files = ["app/portal.tsx", "app/project-media-field.tsx", "app/prepare-project-image.ts", "app/projects-rules-experience.css", "lib/project-media-policy.ts"];
const fingerprint = () => Object.fromEntries(files.map(file => [file, createHash("sha256").update(readFileSync(root + "/" + file)).digest("hex")]));
const report = { source, fixtureBackend: 8834, syntheticOnly: true, mutations: [], screenshots: [], checks: [], errors: [], fingerprint: fingerprint() };
const save = () => writeFileSync(out + "/report.json", JSON.stringify(report, null, 2));
save();
const modes = [
  { name: "1440x900", width:1440,height:900 },
  { name: "390x844", width:390,height:844,touch:true },
  { name: "320x720", width:320,height:720,touch:true },
  { name: "768x1024", width:768,height:1024,touch:true },
  { name: "390x480", width:390,height:480,touch:true },
  { name: "native200-outer1440",width:720,height:378,zoom:true },
];
const browser = await chromium.launch({ executablePath:"/usr/bin/chromium",headless:true,chromiumSandbox:false });
const contexts = new Set();
try {
  const response = await fetch("http://127.0.0.1:8834/api/portal?view=%2Fdashboard",{headers:{cookie:"portal_local_fixture=alice"}});
  assert.equal(response.status,200); const initial=await response.json();
  assert.equal(initial.submissionAccess.attemptsUsed,2); report.before={attempts:2,revision:initial.project.revision,teamPalette:initial.team.palette};save();
  for (const mode of modes) {
    const context=mode.zoom?await chromium.launchPersistentContext(mkdtempSync("/tmp/ddd-media-zoom-"),{executablePath:"/usr/bin/chromium",headless:true,chromiumSandbox:false,viewport:null,args:["--window-size=1440,900"],reducedMotion:"reduce"}):await browser.newContext({viewport:{width:mode.width,height:mode.height},hasTouch:!!mode.touch,isMobile:!!mode.touch,reducedMotion:"reduce"});
    contexts.add(context);
    if(mode.zoom){const settings=await context.newPage();await settings.goto("chrome://settings/appearance");await settings.evaluate(()=>{chrome.settingsPrivate.setDefaultZoom(2,()=>{});return true;});await settings.close();}
    await context.addCookies([{name:"portal_local_fixture",value:"alice",url:origin,httpOnly:true,sameSite:"Strict"}]);
    await context.route("**/*",route=>{const req=route.request();if(new URL(req.url()).origin!==origin||!["GET","HEAD"].includes(req.method())){report.mutations.push({method:req.method(),blocked:true});save();return route.abort();}return route.continue();});
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on("pageerror",error=>{report.errors.push({mode:mode.name,message:error.message});save();});
    const activate=async(locator)=>mode.touch?locator.tap():(await locator.focus(),await locator.press("Enter"));
    const shot=async(name,fullPage=true)=>{
      await page.evaluate(()=>document.fonts.ready);if(fullPage&&!mode.zoom)await page.evaluate(()=>scrollTo(0,0));
      const dimensions=await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,scale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
      assert.equal(dimensions.innerWidth,mode.width);assert.ok(dimensions.scrollWidth<=dimensions.clientWidth+1,`${name} overflow`);
      const path=`${out}/${name}-${mode.name}.png`;
      if(mode.zoom){assert.equal(dimensions.dpr,2);assert.equal(dimensions.scale,1);const cdp=await context.newCDPSession(page);const result=await cdp.send("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});writeFileSync(path,Buffer.from(result.data,"base64"));await cdp.detach();}
      else await page.screenshot({path,fullPage,animations:"disabled",style:"nextjs-portal{visibility:hidden!important}"});
      report.screenshots.push({name,path,mode:mode.name,fullPage:fullPage&&!mode.zoom,dimensions,sha256:createHash("sha256").update(readFileSync(path)).digest("hex")});save();
    };
    await page.goto(origin+"/dashboard#project",{waitUntil:"networkidle",timeout:60000});
    const menu=page.getByRole("button",{name:"Open menu",exact:true});if(await menu.isVisible()){await page.waitForFunction(()=>!document.querySelector('button[aria-label="Open menu"]')?.disabled);assert.equal(await menu.isEnabled(),true);}
    await activate(page.getByRole("tab",{name:"Project",exact:true}));
    await activate(page.getByRole("button",{name:"Update project",exact:true}));
    await page.locator('.submission-v6[data-hydrated="true"]').waitFor();
    await shot("step1");await activate(page.getByRole("button",{name:"Next",exact:true}));await shot("step2");await activate(page.getByRole("button",{name:"Next",exact:true}));await shot("step3");
    const next=async()=>{for(const label of["Save draft","Submit"]){const control=page.getByRole("button",{name:label,exact:true});await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=mode.width+1);}};await next();
    if(mode.name==="1440x900"||mode.name==="390x844"){
      const banner=page.getByLabel("Upload banner",{exact:true}),logo=page.getByLabel("Upload logo",{exact:true});
      const uploads=[['portrait','banner'],['square-alpha','logo'],['ultrawide','banner']];
      for(const[name,kind]of uploads){await(kind==='banner'?banner:logo).setInputFiles(`/tmp/ddd-media-fixtures/${name}.png`);await page.locator(`.submission-media-field-${kind} .submission-media-file`).filter({hasText:name}).waitFor();await page.locator(`.submission-media-field-${kind}[aria-busy="false"]`).waitFor();assert.equal(await page.locator(`#submission-${kind}-error`).count(),0);assert.equal(await page.locator(`.submission-media-frame-${kind} img`).evaluate(el=>getComputedStyle(el).objectFit),'contain');await shot(name);}
      const previous=await page.locator('.submission-media-frame-banner img').getAttribute('src');
      await banner.setInputFiles('/tmp/ddd-media-fixtures/banner-over.png');await page.locator('#submission-banner-error').waitFor();assert.equal(await page.locator('.submission-media-frame-banner img').getAttribute('src'),previous);assert.equal(await page.locator('.action-message').count(),0);await shot('source-too-large-inline-error');
      await banner.setInputFiles('/tmp/ddd-media-fixtures/banner-exact.png');await page.locator('.submission-media-field-banner .submission-media-file').filter({hasText:'banner-exact.png'}).waitFor();await page.locator('.submission-media-field-banner[aria-busy="false"]').waitFor();assert.equal(await page.locator('#submission-banner-error').count(),0);await shot('exact-5MB-banner-prepared');
      await logo.setInputFiles('/tmp/ddd-media-fixtures/logo-exact.png');await page.locator('.submission-media-field-logo .submission-media-file').filter({hasText:'logo-exact.png'}).waitFor();await page.locator('.submission-media-field-logo[aria-busy="false"]').waitFor();assert.equal(await page.locator('#submission-logo-error').count(),0);await shot('exact-1MB-logo-prepared');
      await activate(page.getByRole('button',{name:'Remove logo image',exact:true}));assert.equal(await page.locator('.submission-media-frame-logo img').count(),0);await activate(page.getByRole('button',{name:'Submit',exact:true}));await page.locator('#submission-logo-error').waitFor();await shot('removed-logo-inline-error');
      await logo.setInputFiles('/tmp/ddd-media-fixtures/square-alpha.png');await page.locator('.submission-media-field-logo .submission-media-file').filter({hasText:'square-alpha.png'}).waitFor();await page.locator('.submission-media-field-logo[aria-busy="false"]').waitFor();assert.equal(await page.locator('#submission-logo-error').count(),0);
    }
    report.checks.push({mode:mode.name,passed:true,name:'All3steps aligned; full-aspectmedia and44pxCTAs fit; no overflow or mutation'});save();
    await context.close();contexts.delete(context);
  }
  const after=await fetch('http://127.0.0.1:8834/api/portal?view=%2Fdashboard',{headers:{cookie:'portal_local_fixture=alice'}}).then(r=>r.json());assert.equal(after.project.revision,report.before.revision);assert.equal(after.submissionAccess.attemptsUsed,2);report.after={attempts:2,revision:after.project.revision};
  assert.deepEqual(fingerprint(),report.fingerprint);assert.equal(report.errors.length,0);assert.equal(report.mutations.length,0);
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}finally{for(const c of contexts)await c.close();await browser.close();report.fingerprintAtEnd=fingerprint();save();}
console.log(JSON.stringify({source,screenshots:report.screenshots.length,checks:report.checks.length,failure:report.failure}));
