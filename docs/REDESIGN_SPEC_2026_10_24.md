# DDDHack portal redesign, 24 October 2026

Source baseline: 696b125f9711a4fd6e02c3ece3adadb18b83cba7. This is the existing production Next.js app, synthetic local data only. No deployment or provider changes.

## Visual evidence and limits

- Current local before screenshots: evidence/redesign-before/report.json, desktop1440x900, tablet768x1024, mobile390x844 and short390x480.
- Rejection screenshot: Library libfile_2be74cee336c8191a14fc04e7d413f1c, materialized and viewed at /workspace/library-files/rejected-current-mobile.png. Earlier sign-in error: libfile_d110d0c045688191a23364bfc553f906, materialized and viewed.
- Accepted boards actually materialized and viewed: profile libfile_d5422b4a7efc819197fed4e02c871b30; dashboard libfile_6fdab1b064d08191a2902b20eb60732f; discovery libfile_b957c220b54481919b08ca4e1d98c7d6; admin libfile_24b521bbc148819181168724be7fdb7e; settings libfile_bc5305437da88191aa2987075e302b85.
- Actual Chromium screenshots of https://devfolio.co, https://codex-meetup-perth.keatnuxsuo.chatgpt.site, https://oai-ddec-nd.vercel.app, https://itsparam.in/#projects are in /workspace/reference-evidence, with read-only research report. Devfolio homepage substantiates editorial hierarchy and restrained single-field action; no unseen authenticated form/discovery claims.
- Container Chromium requires its sandbox disabled; fresh contexts only. External reference captures require ignoreHTTPSErrors because of the environment trust store. No real login or private/production records are involved.

## Screenshot audit findings

1. Profile: accepted composition is already recognizable on desktop, but mobile has fixed-height internal form scrolling and cramped palette placement. Fix the responsive structure and accessible errors, preserve all existing values and requirements.
2. Team: one wide column and four large disclosures waste space and fragment membership/settings. Use a clear identity header, desktop members/idea grid and a single Team settings area; render real pending invitations and requests.
3. Discovery: public card contents depend on visibility, so test populated consenting synthetic profiles as well as private/empty records. Keep actual server pagination/search; do not fetch the entire directory for the UI.
4. Admin: repeated settings form headings and broad vertically stacked sections have poor scanability. Group controls by purpose into one selected panel with keyboard navigation; compact repeated labels. Initial participant filters should show all available records.
5. Errors: replace full-width red page bars with contained contextual recovery cards and compact field errors. Failed actions must use assertive toast/error semantics, successes polite status. No suppression of actionable errors.
6. Landing: hold hero layout changes for incoming user-selected mobile mockup. Audit lower dot clipping, CTA thumb position and hitboxes independently. Preserve Delhi/static Metro/portraits/rings/cylinders.

## Shared design system (single owner: integration)

Warm paper #f8f7f3; surface #fffefa; ink #202320; secondary ink #656960; hairline #e3e4db. DM Sans self-hosted, 15px body, 13px labels, 36px desktop page title/28px mobile; avoid oversized generic headings. Spacing scale4/8/12/16/24/32/48, modest10-16px radii, no decorative gradient/shadow stacks. App shell uses warm paper with readable main column and calm navigation. Primary actions ink; green indicates selected/positive states. Expressive assets provide color; no fake eye drawings. Exact observed palette: blue #006aff, green #00ab44, purple #924ff7, orange #f26d00, charcoal #262626, grey #dfdfdf. Existing approved coral/yellow retained. UI icons Lucide; platform logos existing SVGs including WhatsApp.

## Component ownership and acceptance

- Profile agent: profile-flow.tsx + profile-experience.css. Desktop56/44 columns, avatar right; mobile avatar first, normal page scroll,8 expression choices and one row8 compact dots. Exactly Next/Next/Save. Required red asterisks for all required fields. Per-field accessible errors and first invalid focus, final compact server error. Preserve registration prefills, payload and /teams redirect.
- Team/discovery agent: portal.tsx CreateTeam through Discover only + team-discovery-experience.css. Max5, team initials independent project assets, private idea max500, saved idea enables lock without approval, leader3 submissions, personal credits, safe backend contacts only. Use existing team-invite/team-respond contracts for omitted invite controls. View history/read-only counts remain.
- Admin agent: portal.tsx AdminParticipants through Settings only + admin-experience.css; may own owner-submission-window.tsx, admin-status-menu.tsx, admin-import-dialog.tsx for touched validation and dismissal. Group settings Event/Results/Access/Content & scoring; preserve roles, exports, crown transfer, confirmations, scores and disabled-action explanations.
- Integration: shell/tokens/shared Form, Field, feedback, metadata/origin, route skeleton geometry, modal shared behavior and final QA. APP_ORIGIN remains configuration, fallback chosen new host https://dddhack-portal.itsparam.in.
- Landing agent: audit only until selected mobile mockup arrives.

## Verification gates

At each coherent slice compare accepted source and actual local render together, with same CSS viewports; inspect actual pixels. Capture normal/empty/populated/error/loading, all profile steps, create/invite/lock/team panels, directory search/pagination, modal Escape/back/touch, admin controls. Run typecheck/full tests/build plus relevant Playwright synthetic flows. Record frontend resource/request/DOM/timing observations before and after without claiming hosted speed. Screenshots in evidence with source commit and Library receipts; no ready claim based only on build/tests.

Git author and committer for every new commit: Parampreet Singh <rubercuber.30@gmail.com>. Feature branches only, no main pushes/merge/deploy.

