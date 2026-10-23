# Parallel implementation contract — 23 October 2026

Current source is an unverified WIP checkpoint, NOT a publication candidate. Latest user decisions supersede older docs. No credentials, deployment, live imports, role grants, score reveals, paid calls or actual deletions are authorized for agents. Root alone owns schema, lib/**, server routes, scripts and core semantics. UI contracts below are frozen for independent work; some endpoints are planned and being implemented by root. Do not invent fallback success when an endpoint is not ready.

## Owners

- Root: all lib/**, db/**, drizzle/**, app/api/**, scripts/** and shared service/security contracts. Integrate agent commits sequentially. Root does not edit app/portal.tsx while participant agent owns it.
- Public-release agent: isolated worktree from deployed v4 commit 3b5c7251b43afdbab9abd1b6fc40468dde85e70d; completed homepage/Delhi/brand/public SEO only. Preserve v4 backend/schema and stable private flows. No deploy/credential. It may read approved public files from the checkpoint, never copy all participant WIP into the release.
- Participant UI agent: app/portal.tsx, app/profile-flow.tsx, app/dot-avatar.tsx, app/team-avatar.tsx and NEW app/participant-ui.css. Existing app/style.css is frozen; import the new CSS from portal for any scoped additions. No lib/schema/API edits. May wire admin agent components only after handoff.
- Admin UI agent: NEW app/admin-import-controls.tsx, app/admin-participant-actions.tsx, app/admin-project-actions.tsx, app/owner-submission-window.tsx and NEW app/admin-controls.css. Do not edit portal.tsx; provide integration snippets/exports.
- Audit agent: read-only, own report docs/PARALLEL_SECURITY_AUDIT.md only. Audit snapshot first and final integrated source later. No fixes/commits outside report.

All worktrees stay on param302-linux inside this local project. Every shell/tool operation must use assigned worktree cwd. No concurrent writers on shared branches/files. Commit your own tested work, do not push/deploy. No browser/headless workaround: local supported CUA inventory is empty. Static/controller tests do not equal browser QA.

## Current user interface requirements

Public approved home: exact event title; user-supplied Codex SVG plus Codex Community New Delhi; top-right nav; stacked Schedule/Venue/Rules/FAQ; organizers at bottom; approved Delhi mask/fill/static Metro, bounded inverse pointer motion; down arrow; pause/reduced motion. No broad public sidebar.

Profile: exactly three steps, progress, Next/Next/Save directly to Teams, no review page. Step1 full name, readonly authenticated email, required one-line bio + red asterisk, Sex Male/Female/Non-binary, personal dot expression/color; NO participant photo/initials/extra fields. Step2 required international phone + red asterisk, all socials optional (LinkedIn/GitHub/X/Instagram/Website). Step3 only description choice, Organization, OpenAI org ID, short supplied official Find ID link. Exact description options/full Luma headers are pending: do not invent them. Preserve prefills. Eight expressions >< -- ++ ** OO ^^ ^+ ^/. Eight colors approved: blue, green, purple, orange, charcoal, yellow/sunshine, coral, GREY replacing cyan. Values are in lib/avatar-contract.ts; do not change root contract. Team badges ONLY team initials in chosen circle, shared accent. Project logo/banner remain separate 1:1/16:9 uploads.

Single Dashboard: sections Team, Credits, Project (not Submissions). Own-team names/dot avatars/profile links/socials; phones+WhatsApp only current teammates. No duplicate Credits/Submission nav; profile via avatar. Discover Teams/Participants for participants/admins/Viewers, In a team/Not in a team labels, creation optional. Keep management in admin pages. Consistent professional outline icons, labels, active state, mobile hamburger. Use a small local consistent SVG icon component, no new dependency/emoji.

Team: leader rename unlimited before lock and existing confirmed global freeze; lock freezes name/idea/membership, does not approve anyone. Idea title + short description max500 with counter, unlimited save while unlocked, required before lock, private to own current team/admins. Admin override confirmed/audited. Team deletion conditions remain pending: NO multi-member/locked/submitted deletion implementation from ambiguous call.

Project: only leader commits, hard immutable3 attempts, draft/navigation free, atomic retries. At least one team member checked in unlocks; do not assume leader personally checked in. Other members read project/history, max3 versions in accessible modal. Current attendees may read immutable history after edit deadline. Readonly upvote count on Dashboard, NO vote button. Private feedback below, no hidden evaluation progress/score leakage. Own result only server-provided publicResult. Public comments separate.

Showcase votes: arrow/count bordered box, neutral outlined vs green filled with aria-pressed, pending debounce/rollback, keyboard/touch. Viewer cannot vote. No voting window/global quota, one user/project forever across versions. Own-team vote allowed ONLY if that individual checked in; others retain registered/activated eligibility, not check-in for all. No downvotes. Add action idempotent; no unvote action unless separately specified. Frozen scores independent of displayed ongoing votes.

Credits: own individually checked-in assigned recipient only. Heading, sanitized Markdown steps, masked code/API code/link; eye reveal + copy, no logo. No logs/telemetry/storage of secret values. No real allocation/calls.

Admin: Participants, Teams, Submissions/Projects, Settings, owner-only Logs, plus safe Discover. Single participant deactivation only, no bulk delete; confirm exact person/consequences. Recoverable tombstone, preserve history and revoke stale-session/private/credit/mutation/roster eligibility; imports cannot restore. Owner protected; block leader dependency safely. Project/submission/both soft removal per-target confirm; attempts never reset, no stale-version auto exposure, votes/comments/history preserved.

Owner can preview/publish BOTH opening and closing date/time using IST UI / UTC storage, open<close, version/audit/confirmation; defaults remain Nov1 08:00–16:00 IST until changed. Repository cutoff remains strictly AFTER Nov1 08:00 IST for both creation AND first commit, independent of window. Pre-event test records must not become public/results without intentional authorization.

## Frozen data/API shape (root implements missing pieces)

View.me: id,name,email,role,owner,mode(viewer|participant|staff),rostered,canEngage,canParticipate,avatarColor,avatarExpression. Viewer read-only on all mutations; profile/activation requires roster, public/Discover viewing does not. Recheck capabilities on focus; roster addition works with same account.

Dashboard: profile/profileIncomplete; team(id,name,leader_id,locked,palette); members(id,name,role,status,avatarColor,avatarExpression,bio?,socials:string[],phone?,whatsappUrl?); idea(title,description); ideaLocked; submissionAccess(canAccess edits,canRead,attemptsUsed,maxAttempts3,locked); attempts metadata; project(id,slug,revision,draft,published_version_id) only if canRead; projectStats(upvotes,result? public-only); credits(type_id,name,instructions,allocated); feedback(id,body,author,kind,version_id,created_at NO rating); privateVenue only server-filtered. No client inference/fetch of hidden venue/score/phone. Existing venue strict all-member approval remains unless root receives an explicit authorization change; proposed card cannot widen it.

GET /api/portal?view=/discover/teams -> me,team?,items(id,name,bio,avatar:'initials',palette,locked,status,readiness). No idea/phone/credits.
GET view=/discover/participants -> me,items(id,name,avatarColor,avatarExpression,teamName?,teamStatus,bio/socials only existing visibility consent). No phone/email/sex/org IDs.
GET view=/project-history -> own current team, attendance guarded, items(id,attempt,created_at,payload project fields), max3, no evaluation reports. Read only, available after write deadline.
GET view=/profile -> own matched roster/staff bootstrap profile only.

POST actions (via supplied run(a,values), which manages default-safe custom confirmation/outcome and reload):
- complete-profile {displayName,bio,gender(man|woman|non-binary),phone,avatarColor,avatarExpression,socialLinks?:[{type:LinkedIn|GitHub|X|Instagram|Website,url}],bestDescription?,organization?,openaiOrgId?,public?}. No photo/email/skills UI.
- rename-team {name,reason}; save-workspace-idea {title,description<=500}; lock-team {confirmation:'LOCK_TEAM'}.
- admin-idea-override {teamId,title,description,reason,confirmation:'OVERRIDE_TEAM_IDEA'}.
- reveal-credit {typeId} -> {value:string}; no other userId accepted.
- upvote-project {projectId}; comment-project {projectId,body}. Project row.canUpvote is authoritative, me.canEngage gates broad capability; row.upvoted/count from server. Only showcase has mutation.
- admin-status / admin-status-bulk existing status contracts; these are NOT participant deletion.
- participant-deactivate {userId,reason,confirmation:'REMOVE_PARTICIPANT'} and participant-restore {...confirmation:'RESTORE_PARTICIPANT'}. Single target strict, leader/owner dependencies may block with clear error.
- project-soft-delete {projectId,scope:'project'|'submission'|'both',versionId? required for submission/both,reason,confirmation:'REMOVE_PROJECT'|'REMOVE_SUBMISSION'|'REMOVE_BOTH'}; project-restore same exact target with RESTORE_* token. No actual live action.
- preview-import / commit-import {kind:'roster',csv:raw pasted emails OR CSV,fieldMap?:{email,displayName,bio,phone,sex,bestDescription,organization,openaiOrgId,linkedin,github,x,instagram,website: actual header names},digest?}. Preview {digest,headers,fieldMap,counts:{new,existing,invalid,duplicates,prefills},rows:[{row,email,existing,action,warnings?}],errors?}. Explicit mapping, no guessed values. Add-only existing data/status never update. All imports need preview+custom confirm.
- preview-submission-window {open:UTCISO,close:UTCISO} -> {token,version,open,close,openIST,closeIST,warnings}. publish-submission-window {open,close,token,version,reason,confirmation:'CHANGE_SUBMISSION_WINDOW'}. Owner only, no live date change. Root exports istInputToUTC(valueYYYY-MM-DDTHH:mm) and utcToISTInput() from lib/time when implemented; admin UI may implement local formatting temporarily but must validate strict date and no local-zone guessing.

No successful fallback/evaluation fabrication. API pending/error states honest. root reviews all agent diffs/tests sequentially, then full combined tests, build, artifact and supported browser QA. Publication requires a separate tested source boundary and fresh existing-Site source credential approval, not implied standing credential access.

## Latest explicit overrides before parallel start

- Leader MUST personally be checked in for project mutations, not merely another teammate. Team visibility/Not submitted may unlock after any member checks in. Root will supply submissionAccess.canCommit; UI must never infer this from team count. History/read remains current-team+attendance guarded.
- Leader self-delete is confirmed only unlocked + sole member, recoverable, confirmation/audit; no multi-member or locked deletion. Root owns delete-own-team semantics and dependencies; never reset attempts. Use {reason,confirmation:'DELETE_OWN_TEAM'} and server error for blocking dependency.
- Automatic Absent is confirmed for Going never-checked-in people after Nov2 00:00 IST (Nov1 18:30 UTC); preserve Registered/ever-checked-in, idempotent audit. Root implements request-time lazy reconciliation, not an invented scheduled runner. No marking live users now.
- User rejects separate test site/data mode. Owner window changes are real portal settings when explicitly published; real testing consumes real attempts. Admin soft cleanup cannot reset attempts. Repository cutoff stays fixed; no silent eligibility waiver or live test creation.
- Own-project upvote allowed ONLY for individually checked-in voter. Other-project votes require roster/activation but not check-in. No global quota/time window. Frozen scoring is separate. Root row.canUpvote is authoritative.
- All socials are explicitly optional. Avatar colors resolved: eight, replacing cyan with grey; lib/avatar-contract.ts is authoritative. Exact description choices/full CSV headers remain pending, no guessed category list.
- Viewer mode supersedes discovery rejection: authenticated unlisted users can safely browse both discovery tabs and public projects, cannot mutate/comment/vote/join/create/submit or see private ideas/phones/credits. Recheck server capability after roster addition without new account. Staff scoped duties remain existing RBAC; no privilege escalation.
- Current target16:30 UTC/22:00 IST is a target, not a guarantee. Production pieces may be published only after complete cohesive checks and a fresh existing-Site source credential approval. No dirty/WIP publication. Public-only release candidate must be audited for compatibility with newly required participation restrictions before any deploy.
