# DDDHack redesign source research

Captured and visually inspected on 24 October 2026 in the selected cloud executor. All retained source captures have device scale 1. Desktop: 1440 x 1000. Mobile: 390 x 844.

## Current evidence and limits

- `capture-report.json` records HTTP 200 for Devfolio home, Perth, DDEC Delhi and itsparam projects at both sizes. `source-details.json` retains observed DOM/computed styles and sticky geometry. All 12 accepted home/scroll captures were opened with `view_image`.
- A sandboxed browser first aborted before navigation because the installed Chromium SUID helper is not configured. The parent authorized the container-compatible installed configuration. Subsequent read-only captures used isolated Playwright contexts with Chromium sandbox disabled, matching the repository's container test configuration. Public reference contexts ignored the executor's untrusted certificate chain. No sign-in, form submit, production mutation or credentials were used.
- Initial `*-error.png` captures show browser certificate errors and are rejected as design evidence. Devfolio returned a transient Cloudflare 502 during the first detail inspection; its successful prior captures remained valid, and one subsequent detail capture returned 200. Do not describe that 502 page as the source design.
- Existing repository screenshot receipts are historical. They do not verify this redesign. `docs/CLOUD_HANDOFF_V7.md` contains confirmed earlier accepted board IDs; the parent has now materialized five of them to `accepted/`. Those five were opened directly in this run.

## Devfolio

Source: https://devfolio.co/ and public https://devfolio.co/hackathons plus https://devfolio.co/signin.

- Home screenshots show deliberate editorial hierarchy: large mixed regular/heavy typography, short navigation, broad white space and a single email field paired with an arrow action. Illustration is peripheral to the central sentence and action.
- `devfolio-hackathons-desktop.png` shows a constrained content region, an obvious search surface, section heading and a two-column card grid. Each card separates name, metadata and action into clear bands. Mobile uses one column, large readable titles and a full-width action. Use this clarity and progressive density; do not copy its repeated theme/status labels or excessive card height into DDDHack.
- `devfolio-signin-flow-desktop.png` and `devfolio-signin-flow-mobile.png` show a compact centered auth form. Heading, one email/username field and three provider options are ordered without a second explanation above the heading. The actual Google and GitHub logos carry recognizable brand identity. This is public sign-in entry only, not a verified full authentication flow or logged-in onboarding.
- Fonts observed: Nunito Sans on marketing home. No instruction to replace DDDHack's installed font families follows from this observation.

## Perth DevDay expressions and colors

Source: https://codex-meetup-perth.keatnuxsuo.chatgpt.site/.

- `perth-desktop.png` shows white/ink composition, very large DevDay/green Exchange display, one black primary action and a bottom row of cropped expressive circles.
- `perth-mobile.png` moves to a compact, left-aligned display heading with the expressive strip near the viewport bottom. The source has no literal eyeball/pupil drawing. Paired symbolic marks remain inside colored circles.
- It supports restrained use of expression dots as a brand accent. It does not justify giant decorative circles crowding profile fields or admin controls.

## DDEC Delhi expressions and colors

Source: https://oai-ddec-nd.vercel.app/.

- `ddec-desktop.png` shows two clear hero regions: text/metadata/actions on the left and circles on the right. Mobile preserves the content/action sequence before decoration.
- Observed DOM circle marks include `><`, `__`, `++`, `OO`, `**`, `^+`, `^/`, and mixed variants. The earlier accepted profile board and existing app contract define DDDHack's exact eight choices; additional source variants are not authorization to add more.
- Exact shared core background colors observed in computed DDEC circle styles and dominant flat pixels in both DDEC/Perth captures: blue `#006aff`, green `#00ab44`, purple `#924ff7`, orange `#f26d00`, charcoal `#262626`, grey `#dfdfdf`. Yellow/coral are approved DDDHack additions from its existing avatar contract, not claimed reference colors.
- Body colors: DDEC `#fcfcfc` background / `#0d0d0d` ink, Perth white / `#181818`. DDDHack's latest warm off-white instruction takes precedence over literal white matching.

## itsparam stacked projects

Source: https://itsparam.in/#projects.

- `param-desktop.png` and `param-desktop-scroll.png` show the second rounded cyan project section overlapping and covering the first white project section after 500 px of scrolling.
- DOM confirms the heading sticks at 76 px and four project cards stick at 166, 180, 194 and 208 px: a 14 px increment per card. Cards alternate image/text order on desktop.
- `param-mobile.png` and `param-mobile-scroll.png` show the same progression at 390 px, with each card's image preceding its text and controls, plus a persistent bottom navigation. The colored layer overlaps the previous layer. This is an inspected scrolling reference, not an instruction to reproduce its colors, shadows, typography or bottom menu.
- For DDDHack, retain ordinary readable document flow whenever content cannot fit the sticky stage, and respect reduced motion. Existing app geometry already guards stage fit.

## Earlier accepted source boards now available

These exact files were materialized by the parent and opened here:

- `accepted/01-profile-three-steps.png`: desktop form left/avatar right divided by a quiet rule; eight expressions in a 4 x 2 group, eight compact palette dots; segmented progress; mobile avatar first; contact/socials second; about-you third; Next/Next/Save. Generated labels do not override current requirements.
- `accepted/02-dashboard-team-credits-project.png`: separate Team/Credits/Project tabs, initial-based team marks, compact roster rows with real social icons/phone within private member view, tinted locked idea surface, personal credit providers, submission card and private feedback.
- `accepted/03-discover-and-profile.png`: strong Discover title, People/Teams switch, one search row, membership filter controls; public profile detail without phone/private data. Latest user instruction requests cards and lazy pagination, overriding this older list arrangement.
- `accepted/05-admin-management.png`: aligned filters/table header, restrained badge use, actions at the title edge, email import and a small target/count confirmation. Existing server status semantics override illustrative badge content.
- `accepted/07-owner-settings-project-review.png`: short clearly separated settings sections and compact inline controls, rather than deeply nested duplicate boxes; mobile fields stack. Existing scoring/reveal semantics and confirmations remain unchanged.

## Existing real assets to retain

- `public/art/delhi-v3/fallback-approved-v3.png` was opened. Its landmark-filled NEW DELHI lettering and long thin Metro are the approved 2048 x 768 composition. Preserve it and the independently static Metro layer. `docs/assets/delhi-v3-manifest.json` binds the exact source and hashes.
- Keep the original `public/organizers/{Param3021,HowDevelop,nikhilsbuilds,callmeshuklaji}-x.jpg` portraits. Their existence does not authorize generated replacement faces.
- Reuse `public/icons/social/{github,linkedin,instagram,website,x,whatsapp}.svg` and the original Codex brand asset.
- `app/dot-avatar.tsx`, `lib/avatar-contract.ts`, `app/dots.tsx` and `app/home-motion.ts` contain the existing symbolic marks, eight approved choices, color keys and lightweight animation/offscreen/reduced-motion behavior. Shared contract ownership should stay central.

No application file was edited by the research lane.
