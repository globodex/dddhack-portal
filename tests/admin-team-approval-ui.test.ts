import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import AdminTeamApproval, { TeamApprovalDetails, approvalSocialUrl, hasTeamApprovalConfirmation, parseTeamApprovalPreview, teamIsApproved, teamNeedsApproval, type TeamApprovalPreview } from "../app/admin-team-approval";
import AdminTeamCard from "../app/admin-team-card";
import { requiresActionConfirmation } from "../lib/action-confirmation";
import { TeamWorkspace } from "../app/portal";

const team = { id: "synthetic_team", name: "Synthetic Builders", locked: true, members: [{ approval: "pending", status: "Registered" }] };
const preview: TeamApprovalPreview = {
  team: { id: team.id, name: team.name, locked: true },
  idea: { title: "Synthetic private idea", description: "Only an authorized preview can contain this description." },
  members: [
    { id: "registered", name: "Synthetic Registered", email: "registered@example.invalid", githubUrl: "https://github.com/synthetic-builder", linkedinUrl: "https://www.linkedin.com/in/synthetic-builder", profession: "Student", gender: "woman", genderLabel: "Female", status: "Registered", approval: "pending", willBecomeGoing: true, approvalIssue: null },
    { id: "absent", name: "Synthetic Absent", email: "absent@example.invalid", githubUrl: null, linkedinUrl: null, profession: null, gender: null, genderLabel: null, status: "Absent", approval: "approved", willBecomeGoing: false, approvalIssue: null },
    { id: "checked", name: "Synthetic Checked", email: "checked@example.invalid", githubUrl: null, linkedinUrl: null, profession: "Working Professional", gender: "prefer-not-to-say", genderLabel: "Prefer not to say", status: "Checked in", approval: "approved", willBecomeGoing: false, approvalIssue: null },
  ],
  snapshotDigest: "a".repeat(64), canApprove: true, blockedReason: null,
};
const neverRun = async () => { throw new Error("Rendering cannot mutate."); };

test("approval trigger is absent for unlocked/already-approved teams and initial SSR exposes no private preview", () => {
  assert.equal(renderToStaticMarkup(createElement(AdminTeamApproval, { team: { ...team, locked: false }, run: neverRun })), "");
  assert.equal(renderToStaticMarkup(createElement(AdminTeamApproval, { team: { ...team, members: [{ status: "Absent", approval: "approved" }] }, run: neverRun })), "");
  const html = renderToStaticMarkup(createElement(AdminTeamApproval, { team, run: neverRun }));
  assert.match(html, /disabled=""/); assert.match(html, /Approve team/);
  assert.doesNotMatch(html, /registered@example|private idea|<dialog|snapshotDigest|phone/);
  assert.equal(requiresActionConfirmation("approve-team"), true, "The shared unknown-action default stays fail-safe");
  assert.equal(hasTeamApprovalConfirmation("approve-team", { teamId: team.id, snapshotDigest: preview.snapshotDigest, confirmation: "APPROVE_TEAM" }), true);
  assert.equal(hasTeamApprovalConfirmation("approve-team", { teamId: team.id }), false);
  assert.equal(hasTeamApprovalConfirmation("remove-member", { teamId: team.id, snapshotDigest: preview.snapshotDigest, confirmation: "APPROVE_TEAM" }), false);
  assert.match(readFileSync("app/portal.tsx", "utf8"), /requiresActionConfirmation\(action\)\s*&&\s*!hasTeamApprovalConfirmation\(\s*action,\s*values,?\s*\)/);
});

test("underlying approval survives attendance and never treats an empty team or unapproved Absent as approved", () => {
  assert.equal(teamIsApproved({ locked: true, members: [{ status: "Absent", approval: "approved" }, { status: "Checked in", approval: "approved" }] }), true);
  assert.equal(teamIsApproved({ locked: true, members: [] }), false);
  assert.equal(teamIsApproved({ locked: true }), false);
  assert.equal(teamIsApproved({ locked: false, members: [{ approval: "approved" }] }), false);
  assert.equal(teamIsApproved({ locked: true, members: [{ status: "Going", approval: "pending" }] }), false);
  assert.equal(teamNeedsApproval({ ...team, members: [{ status: "Absent", approval: "pending" }] }), true);
});

test("actual Dashboard approved chip uses the persisted lock and underlying approvals, including approved Absent", () => {
  const member = { id: "synthetic_leader", name: "Synthetic leader", role: "leader", status: "Absent", approval: "approved" };
  const data = { me: { id: member.id, name: member.name, email: "leader@example.invalid", role: "participant", owner: false, canParticipate: true }, team: { ...team, leader_id: member.id }, members: [member], idea: { title: "Saved idea", description: "Saved description" }, submissionAccess: { canRead: false, canCommit: false }, ideaLocked: true };
  const approved = renderToStaticMarkup(createElement(TeamWorkspace, { data, run: neverRun }));
  assert.match(approved, /class="studio-approved-chip"/);
  for (const changes of [{ team: { ...data.team, locked: false } }, { members: [] }, { members: [{ ...member, approval: "pending" }] }]) {
    const html = renderToStaticMarkup(createElement(TeamWorkspace, { data: { ...data, ...changes }, run: neverRun }));
    assert.doesNotMatch(html, /class="studio-approved-chip"/);
  }
});

test("Dashboard lifecycle advances approved Absent from Approved to Yet to submit using the projected window flag", () => {
  const member = { id: "synthetic_leader", name: "Synthetic leader", role: "leader", status: "Absent", approval: "approved" };
  const data = { me: { id: member.id, name: member.name, email: "leader@example.invalid", role: "participant", owner: false, canParticipate: true }, team: { ...team, leader_id: member.id }, members: [member], idea: { title: "Saved idea", description: "Saved description" }, submissionAccess: { canRead: false, canCommit: false, attemptsUsed: 0, windowHasOpened: false }, checkedIn: false, teamFacts: { checkedInMembers: 0 } };
  const render = (changes: Record<string, any> = {}) => renderToStaticMarkup(createElement(TeamWorkspace, { data: { ...data, ...changes }, run: neverRun }));
  const before = render().match(/<ol class="studio-progress"[\s\S]*?<\/ol>/)?.[0] || "";
  assert.match(before, /data-stage="2"/);
  assert.match(before, /aria-current="step"[\s\S]*?<strong>Approved<\/strong>/);
  const html = render({ submissionAccess: { ...data.submissionAccess, windowHasOpened: true } });
  const progress = html.match(/<ol class="studio-progress"[\s\S]*?<\/ol>/)?.[0] || "";
  assert.match(progress, /data-stage="3"/);
  assert.match(progress, /aria-current="step"[\s\S]*?<strong>Yet to submit<\/strong>/);
  assert.equal((progress.match(/<li\b/g) || []).length, 5);
  for (const label of ["Forming team", "Locked", "Approved", "Yet to submit", "Submitted"]) assert.ok(progress.includes(label));
  assert.doesNotMatch(progress, /Team checked in|members/);
  assert.match(html, /class="studio-approved-chip"/);
  assert.doesNotMatch(html, /See you at check-in|You’re going to the hackathon|One team member must check in/);
  assert.match(html, /Your personal attendance status is Absent/);
  const unapproved = render({ members: [{ ...member, status: "Going", approval: "pending" }], submissionAccess: { ...data.submissionAccess, windowHasOpened: true } });
  assert.match(unapproved.match(/<ol class="studio-progress"[\s\S]*?<\/ol>/)?.[0] || "", /data-stage="1"/);
});

test("detailed preview has only Registered→Going, preserves attendance, saved social/sex presentation and unavailable fields", () => {
  const html = renderToStaticMarkup(createElement(TeamApprovalDetails, { preview }));
  assert.match(html, /Synthetic private idea/); assert.match(html, /authorized preview/);
  assert.match(html, /Registered to Going/);
  assert.match(html, /Absent, unchanged/); assert.match(html, /Checked in, unchanged/);
  assert.match(html, /href="https:\/\/github.com\/synthetic-builder"/);
  assert.match(html, /href="https:\/\/www.linkedin.com\/in\/synthetic-builder"/);
  assert.match(html, /lucide-venus/); assert.match(html, /Female/); assert.match(html, /Prefer not to say/);
  assert.match(html, /GitHub unavailable/); assert.match(html, /LinkedIn unavailable/);
  assert.match(html, /Profession unavailable/); assert.match(html, /Sex unavailable/);
  assert.doesNotMatch(html, /mailto:|tel:|whatsapp|organization|genderConfirmed|snapshotDigest/);
  const blocked = { ...preview, canApprove: false, members: [{ ...preview.members[1], approval: "pending", approvalIssue: "Resolve this member’s approval before approving the team." }] };
  assert.match(renderToStaticMarkup(createElement(TeamApprovalDetails, { preview: blocked })), /Resolve this member/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(TeamApprovalDetails, { preview: blocked })), /Absent to Going/);
  assert.match(renderToStaticMarkup(createElement(TeamApprovalDetails, { preview: { ...preview, idea: null, members: [] } })), /Idea unavailable|No current members/);
});

test("preview parsing rejects wrong targets, missing shape and forbidden attendance rewrites; unsafe social URLs never become links", () => {
  assert.equal(parseTeamApprovalPreview(preview, team.id), preview);
  for (const body of [null, {}, { ...preview, team: { ...preview.team, id: "different" } }, { ...preview, members: [{ ...preview.members[1], willBecomeGoing: true }] }])
    assert.throws(() => parseTeamApprovalPreview(body as any, team.id), /unavailable/);
  for (const value of ["javascript:alert(1)", "https://github.com.evil.invalid/person", "https://user:pass@github.com/person", "https://github.com:444/person", "http://github.com/person"])
    assert.equal(approvalSocialUrl(value, "github"), "");
  assert.equal(approvalSocialUrl("https://www.linkedin.com/in/synthetic", "linkedin"), "https://www.linkedin.com/in/synthetic");
});

test("card markup orders separate identity, approval, chevron and menu without nested buttons", () => {
  const html = renderToStaticMarkup(createElement(AdminTeamCard, {
    name: team.name, avatar: createElement("span", null, "SB"), caption: "Locked", defaultOpen: true,
    actions: createElement(AdminTeamApproval, { team, run: neverRun }), menu: createElement("button", null, "More actions"), children: "Members",
  }));
  assert.ok(html.indexOf('class="admin-team-card-toggle"') < html.indexOf('class="admin-team-approve-button"'));
  assert.ok(html.indexOf('class="admin-team-approve-button"') < html.indexOf('class="admin-team-card-chevron-toggle"'));
  assert.ok(html.indexOf('class="admin-team-card-chevron-toggle"') < html.indexOf('class="admin-team-card-menu"'));
  assert.doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
});

test("approval modal is lazy, keyboard/touch accessible, stable through pending/errors and reloads stale snapshots", { skip: !existsSync("/usr/bin/chromium") }, async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Approval,{teamNeedsApproval} from './app/admin-team-approval'; import Card from './app/admin-team-card';
    const root=createRoot(document.getElementById('root')); window.reads=[];window.writes=[];
    window.preview=${JSON.stringify(preview)};window.previewWait=false;window.previewFailure=false;
    window.fetch=async(url,options)=>{window.reads.push({url,cache:options.cache,credentials:options.credentials});
      if(window.previewWait)await new Promise(resolve=>window.releasePreview=resolve);
      return new Response(JSON.stringify(window.previewFailure?{code:'UNAVAILABLE',message:'Preview unavailable. Retry.'}:window.preview),{status:window.previewFailure?503:200,headers:{'content-type':'application/json'}});};
    const run=(action,values,options)=>{window.writes.push({action,values,options});return new Promise((resolve,reject)=>{window.resolveWrite=resolve;window.rejectWrite=(message,status,code)=>reject(Object.assign(new Error(message),{status,code}));});};
    window.renderTeam=(team)=>root.render(React.createElement('main',{className:'main admin-workspace'},React.createElement('section',{className:'admin-teams-page'},React.createElement('ul',null,React.createElement(Card,{name:team.name,avatar:React.createElement('span',null,'SB'),caption:'Locked',defaultOpen:true,actions:teamNeedsApproval(team)?React.createElement(Approval,{team,run}):null,menu:React.createElement('button',null,'More actions')},'Existing members')))));
    window.renderTeam(${JSON.stringify(team)});
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic" });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  try {
    for (const mode of [{ width: 1440, height: 900 }, { width: 320, height: 480 }]) {
      const context = await browser.newContext({ viewport: mode, hasTouch: mode.width < 600, reducedMotion: "reduce" });
      const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      const css = readFileSync("app/admin-team-approval.css", "utf8");
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.admin-team-card-header{display:grid}.button,button{min-height:44px}button{cursor:pointer}.admin-team-card-toggle{display:flex;min-width:0}.admin-team-card-identity{min-width:0;overflow-wrap:anywhere}ul{list-style:none;padding:0}.admin-teams-page{padding:16px}.button{padding:10px 14px;border:1px solid #ddd;border-radius:8px}${css}</style><div id="root"></div>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const trigger = page.getByRole("button", { name: "Approve team", exact: true });
      await trigger.waitFor(); await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.admin-team-approve-button')?.disabled);
      assert.equal(await page.evaluate(() => (window as any).reads.length), 0);
      if (mode.width < 600) await trigger.tap(); else { await trigger.focus(); await trigger.press("Enter"); }
      const dialog = page.locator('.admin-team-approval-dialog[open]'); await dialog.waitFor(); await page.getByText("Synthetic private idea", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => (window as any).reads.length), 1);
      assert.equal(await page.evaluate(() => (window as any).reads[0].cache), "no-store");
      assert.equal(await page.evaluate(() => (window as any).reads[0].credentials), "same-origin");
      assert.ok((await page.evaluate(() => (window as any).reads[0].url)).includes("focus=synthetic_team"));
      const close = dialog.getByRole('button', { name: 'Close team approval' }); await close.focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.getByRole('button', { name: 'Approve team', exact: true }).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); await page.waitForFunction(() => document.activeElement?.classList.contains('admin-team-approve-button'));
      await trigger.click(); await page.getByText("Synthetic private idea", { exact: true }).waitFor(); await page.goBack(); await dialog.waitFor({ state: 'detached' });
      await trigger.click(); await page.getByText("Synthetic private idea", { exact: true }).waitFor();
      const before = await dialog.boundingBox(); const confirm = dialog.locator('.team-approval-confirm');
      const confirmBox = await confirm.boundingBox(); assert.ok(confirmBox && confirmBox.height >= 44 && confirmBox.width >= 44 && confirmBox.x >= 0 && confirmBox.x + confirmBox.width <= mode.width);
      await dialog.locator('.team-approval-dialog-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
      await confirm.click(); await confirm.waitFor({ state: 'visible' }); assert.equal(await confirm.isDisabled(), true);
      assert.equal(await page.evaluate(() => (window as any).writes.length), 1);
      assert.deepEqual(await page.evaluate(() => (window as any).writes[0]), { action: 'approve-team', values: { teamId: team.id, snapshotDigest: preview.snapshotDigest, confirmation: 'APPROVE_TEAM' }, options: { errorFeedback: 'local' } });
      await page.evaluate(() => { (window as any).preview = { ...(window as any).preview, snapshotDigest: 'b'.repeat(64) }; (window as any).rejectWrite('Team details changed. Review the latest snapshot.', 409, 'TEAM_APPROVAL_CHANGED'); });
      await dialog.getByRole('alert').filter({ hasText: 'Team details changed' }).waitFor(); await page.waitForFunction(() => (window as any).reads.length === 4);
      assert.equal(await dialog.locator('.team-approval-dialog-body').evaluate(node => node.scrollTop), 0, 'Actionable failure is brought into the visible body');
      await page.getByText("Synthetic private idea", { exact: true }).waitFor();
      assert.deepEqual(await dialog.boundingBox(), before, 'Stale error and reload do not shift dialog');
      await confirm.click(); await page.evaluate(() => (window as any).rejectWrite('Approval failed. Try again.', 503, 'UNAVAILABLE'));
      await dialog.getByRole('alert').filter({ hasText: 'Approval failed' }).waitFor();
      assert.deepEqual(await dialog.boundingBox(), before, 'Action failure remains within the fixed dialog frame');
      assert.equal(await page.evaluate(() => (window as any).reads.length), 4, 'Non-stale failure adds no preview request');
      await confirm.click(); await page.evaluate((approvedTeam) => { (window as any).renderTeam(approvedTeam); (window as any).resolveWrite({ message: 'Team approved.' }); }, { ...team, members: [{ approval: 'approved', status: 'Absent' }] });
      await dialog.waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.classList.contains('admin-team-card-toggle'));
      assert.equal(await page.evaluate(() => (window as any).writes[2].values.snapshotDigest), 'b'.repeat(64));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      assert.deepEqual(errors, []); await context.close();
    }
  } finally { await browser.close(); }
});
