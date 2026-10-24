import assert from "node:assert/strict";
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {chromium} from "@playwright/test";
const origin="http://localhost:3005";
assert.equal(process.env.QA_FRESH_DB,"/tmp/ddd-projects-controls.sqlite");
assert.ok(existsSync(process.env.QA_FRESH_DB));
const output="evidence/projects-rules-positive";
mkdirSync(output,{recursive:true});
const report={source:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),origin,syntheticOnly:true,freshDatabase:process.env.QA_FRESH_DB,checks:[],writes:[],errors:[]};
const persist=()=>writeFileSync(output+"/report.json",JSON.stringify(report,null,2));
const check=(name)=>{report.checks.push({name,passed:true});persist()};
const b=await chromium.launch({executablePath:"/usr/bin/chromium",chromiumSandbox:false,headless:true});
const c=await b.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
await c.addCookies([{name:"portal_local_fixture",value:"alice",url:origin,httpOnly:true,sameSite:"Strict"}]);
await c.route("**/*",route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin!==origin)return route.abort("blockedbyclient");
 if(!["GET","HEAD"].includes(req.method())){
  const body=req.postDataJSON();
  assert.ok(["save-project","upvote-project","comment-project"].includes(body.action));
  if(body.action!=="save-project")assert.equal(body.data.projectId,"visual_project_alice");
  else assert.equal(body.data.revision,2);
  assert.equal(report.writes.filter(w=>w.action===body.action).length,0,"one positive request per action");
  report.writes.push({action:body.action,actor:"fake_alice",status:"pending"});persist();
 }
 assert.ok(!url.search.includes("SYNTHETIC_PRIVATE"));
 return route.continue();
});
const p=await c.newPage();p.on("pageerror",e=>report.errors.push(e.message));
const api=async(path)=>{const r=await c.request.get(origin+path);assert.equal(r.status(),200);return r.json()};
const confirm=async(action,trigger)=>{
 const response=p.waitForResponse(r=>r.request().method()==="POST"&&r.url().endsWith("/api/portal")&&r.request().postDataJSON().action===action);
 await trigger();
 await p.locator(".confirmation-dialog[open]").waitFor();
 await p.locator(".confirmation-dialog").getByRole("button",{name:"Confirm change",exact:true}).click();
 const r=await response;
 const entry=report.writes.find(w=>w.action===action);entry.httpStatus=r.status();entry.status=r.status()===200?"persisted":"failed";entry.result=await r.json();persist();
 assert.equal(r.status(),200,JSON.stringify(entry.result));
};
try{
 assert.equal((await api("/api/health")).runtime,"synthetic-local");
 let view=await api("/api/portal?view=%2Fdashboard");assert.equal(view.me.id,"fake_alice");assert.equal(view.project.revision,2);assert.equal(view.submissionAccess.attemptsUsed,2);
 await p.goto(origin+"/dashboard#project",{waitUntil:"networkidle",timeout:60000});
 await p.getByRole("tab",{name:"Project",exact:true}).click();await p.getByRole("button",{name:"Update project",exact:true}).click();await p.locator(".project-editor:not([inert])").waitFor();
 await p.locator('[name="projectName"]').fill("SYNTHETIC_PRIVATE_UI_DRAFT");
 await p.getByRole("button",{name:"Next",exact:true}).click();await p.getByRole("button",{name:"Next",exact:true}).click();
 await confirm("save-project",()=>p.getByRole("button",{name:"Save draft",exact:true}).click());
 view=await api("/api/portal?view=%2Fdashboard");assert.equal(view.project.draft.projectName,"SYNTHETIC_PRIVATE_UI_DRAFT");assert.equal(view.project.revision,3);assert.equal(view.submissionAccess.attemptsUsed,2);
 check("Real browser Save draft persists new revision and consumes no committed attempt");
 await p.goto(origin+"/projects/synthetic-alice",{waitUntil:"networkidle"});
 const vote=p.getByRole("button",{name:/^Upvote Small Wonder;/});assert.equal(await vote.isEnabled(),true);
 await confirm("upvote-project",()=>vote.click());await p.getByRole("button",{name:/^Upvoted Small Wonder;/}).waitFor();assert.equal(await p.getByRole("button",{name:/^Upvoted Small Wonder;/}).isDisabled(),true);
 const publicView=await api("/api/portal?view=%2Fprojects%2Fsynthetic-alice");assert.equal(publicView.items[0].upvoted,true);
 check("Real browser upvote persists once; pressed state disables repeat vote");
 await p.getByRole("textbox",{name:"Public comment",exact:true}).fill("Synthetic UI verification comment.");
 await confirm("comment-project",()=>p.getByRole("button",{name:"Post comment",exact:true}).click());
 const comments=await api("/api/portal?view=%2Fprojects%2Fsynthetic-alice");assert.ok(comments.comments.some(x=>x.body==="Synthetic UI verification comment."&&x.author==="Alice"));
 check("Real browser public comment persists through existing permission and confirmation flow");
 assert.equal(report.errors.length,0);
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await b.close();persist();}
console.log(JSON.stringify(report,null,2));
