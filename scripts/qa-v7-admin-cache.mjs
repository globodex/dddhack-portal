// Read-only localhost browser proof. Durable status/override mutations are separately covered by actual D1 tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
if (!process.argv.includes("--preview-ready")) throw new Error("Requires frozen synthetic preview readiness");
const manifest = JSON.parse(readFileSync(process.env.PERF_MANIFEST, "utf8"));
assert.equal(manifest.disposable, true); assert.equal(manifest.syntheticOnly, true);
const origin = manifest.origin; assert.equal(new URL(origin).hostname, "127.0.0.1");
const workerHash = () => createHash("sha256").update(readFileSync(resolve(manifest.artifactRoot, "dist/server/index.js"))).digest("hex");
assert.equal(workerHash(), manifest.worker);
const output = resolve("evidence/v7-admin-presentation", `${manifest.source.slice(0,8)}-${new Date().toISOString().replaceAll(":","-")}`);
mkdirSync(output, { recursive: true });
const report = { source: manifest.source, worker: manifest.worker, chromiumSandbox: true, origin, syntheticOnly: true, writes: false, checked: [], refreshes: [], errors: [], limitations: ["Fresh status/rename/avatar/locked-idea mutations are verified in the separate actual D1 HTTP test; this browser run performs GET-only refreshes.", "Synthetic trusted identity headers simulate session changes on localhost. Real managed sign-in/session completion is not tested.", "JSON byte counts are decoded response-body sizes, not network/compressed transfer or database cost."] };
const save = () => writeFileSync(`${output}/report.json`, JSON.stringify(report,null,2)+"\n");
const headers = (name) => ({ "oai-authenticated-user-id": `fake_${name}`, "oai-authenticated-user-email": `${name}@portal.test`, "oai-authenticated-user-full-name": `Synthetic ${name}` });
let browser;
try {
 browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", chromiumSandbox: true, headless: true, args: ["--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1"] });
 const context = await browser.newContext({ viewport: {width:1440,height:900}, serviceWorkers:"block", extraHTTPHeaders: headers("admin") });
 const page = await context.newPage();
 const apis=[];
 page.on("request", (request) => { const url=new URL(request.url()); if (["http:","https:"].includes(url.protocol) && (url.origin!==origin || !["GET","HEAD"].includes(request.method()))) report.errors.push(`Unexpected ${request.method()} ${url.origin}${url.pathname}`); });
 page.on("response", (response) => { if(new URL(response.url()).pathname==="/api/portal")apis.push(response); });
 const check=async(name,fn)=>{await fn();report.checked.push(name);save();};
 const expireAndRefresh=async()=>{
  await page.waitForTimeout(2100);
  const waiting=page.waitForResponse((response)=>new URL(response.url()).pathname==="/api/portal");
  await page.evaluate(()=>{for(let n=0;n<3;n++){window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"));}});
  const response=await waiting;
  const body=await response.json();
  await page.waitForTimeout(180);
  return {response,body};
 };
 await page.goto(origin+"/admin/participants",{waitUntil:"domcontentloaded"});
 await page.locator(".participants-table tbody tr").first().waitFor();
 const beforeText=await page.locator(".participants-table").innerText();
 const fullResponse=await context.request.get(origin+"/api/portal?view=%2Fadmin%2Fparticipants&focus=");
 const full=await fullResponse.json();
 assert.equal(full.adminPresentation.unchanged,false);
 const fullBytes=Buffer.byteLength(JSON.stringify(full));
 await check("SSR primes presentation cache without bootstrap API",async()=>assert.equal(apis.length,0));
 for(let index=0;index<2;index++){
  await check(`browser refresh${index+1} sends exact version and merges omitted labels`,async()=>{
   const count=apis.length;
   const {response,body}=await expireAndRefresh();
   assert.equal(response.status(),200);assert.equal(apis.length,count+1);
   assert.equal(new URL(response.url()).searchParams.get("presentation"),full.adminPresentation.version);
   assert.equal(body.adminPresentation.unchanged,true);
   for(const row of body.items){if(typeof row.id==="string"&&row.id){assert.equal("name"in row,false);assert.equal("avatarColor"in row,false);assert.ok("status"in row);}}
   assert.match(response.headers()["cache-control"],/private, no-store/);
   assert.equal(await page.locator(".participants-table").innerText(),beforeText);
   const bytes=Buffer.byteLength(JSON.stringify(body));assert.ok(bytes<fullBytes);
   report.refreshes.push({index:index+1,fullJsonBytes:fullBytes,deltaJsonBytes:bytes,savedJsonBytes:fullBytes-bytes,itemCount:body.items.length,unchanged:true,statusFresh:true});
   if(index===0){const screenshot=`${output}/admin-refresh.png`;await page.screenshot({path:screenshot,fullPage:false});report.screenshots=[{path:screenshot,viewport:{width:1440,height:900},state:"after exact-version delta refresh",data:"synthetic fixture only"}];}
  });
 }
 await check("actor switch cannot use Admin presentation version to bypass fresh authorization",async()=>{
  await context.setExtraHTTPHeaders(headers("bob"));
  const {response,body}=await expireAndRefresh();assert.equal(response.status(),403);assert.equal(body.adminPresentation,undefined);
  assert.equal(await page.locator(".participants-table").count(),0);
 });
 await check("returning account requests a full presentation after denial clears snapshot",async()=>{
  await context.setExtraHTTPHeaders(headers("admin"));
  const {response,body}=await expireAndRefresh();assert.equal(response.status(),200);
  assert.equal(new URL(response.url()).searchParams.has("presentation"),false);assert.equal(body.adminPresentation.unchanged,false);
  await page.locator(".participants-table tbody tr").first().waitFor();
  assert.equal(await page.locator(".participants-table").innerText(),beforeText);
 });
 await check("pagehide clears snapshot and browser pageshow requests full refresh",async()=>{
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pagehide")));
  const waiting=page.waitForResponse((response)=>new URL(response.url()).pathname==="/api/portal");
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
  const response=await waiting;const body=await response.json();assert.equal(response.status(),200);
  assert.equal(new URL(response.url()).searchParams.has("presentation"),false);assert.equal(body.adminPresentation.unchanged,false);
  await page.locator(".participants-table tbody tr").first().waitFor();
 });
 assert.equal(workerHash(),manifest.worker);
 await context.close();
} catch(error){report.errors.push(String(error?.stack||error));process.exitCode=1;}
finally{await browser?.close();report.browserClosed=true;report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({report:`${output}/report.json`,checked:report.checked,refreshes:report.refreshes,errors:report.errors},null,2));}
