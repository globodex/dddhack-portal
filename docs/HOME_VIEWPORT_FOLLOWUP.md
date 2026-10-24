# Home viewport follow-up

Source implementation: `4e09abe3c24f10a3931c0073218523789cdc84cb`, detached from `3fee26d8c5a352c9ef829929ee64f2576c4b3a22`. Both author and committer are Parampreet Singh <rubercuber.30@gmail.com>. This lane did not create a branch, push, deploy, change providers or access hosted data.

## Actual finding and change

The prior sparse-chapter override made Venue and empty Schedule compact at tablet sizes. Mobile sections explicitly had no minimum height. The geometry also queried the former `.public-header`, missing the real sticky `.navigation-header` height of69–80px. All sticky ancestors were inspected and had visible overflow; overflow was not the cause.

| Viewport | Before Venue height | After Venue height |
| --- | ---: | ---: |
|1440×900|848px|900px|
|768×1024|266.8px|1024px|
|390×844|265.4px|844px|
|320×480|265.4px|480px|

Hero, chapters and organizer section now reserve a full viewport using `100vh` with `100svh` support, while content can grow. One measured geometry model accounts for the real navigation height at every breakpoint. Tall agenda/FAQ content scrolls through its last line before a negative sticky pin takes effect. Reduced motion and paused motion use ordinary document flow while retaining full-height sections. No scroll hijacking, fixed content clipping or new animation dependency was added.

The original upper component rendered four expressions on compact screens and eight on desktop. The latest request keeps its desktop variant as a narrow twelve-expression rail, using the existing palette/assets, while removing the compact four-expression group. Bottom expressions remain separate and unchanged. The unused upper speech-bubble timer was removed. The rail retains existing offscreen, hidden-tab and reduced-motion handling.

The hero branding row contains only the official OpenAI wordmark, a small multiplication sign and the existing official Cerebras logo. Date and Hosted by Codex Ambassadors remain. The wordmark was downloaded from the [official brand page](https://openai.com/brand/) through its published `https://cdn.openai.com/brand/openai-logos.zip` link. The SVG is unmodified, including original clear space. The referenced Luma poster was unavailable; this is not a claim of having inspected or exactly matched that poster. Provenance is in `public/brand/OPENAI-SOURCE.json`.

Only Parampreet's portrait changes to the public Param302 GitHub avatar verified by the authorized GitHub profile read. Its transparent400×400 WebP is26,370 bytes. Other organizer portraits, links, roles, rings and cylinders remain. Asset provenance and hashes are in `public/organizers/PARAM302-GITHUB-SOURCE.json`.

## Private arrival renderer

Home accepts an optional `privateVenue: { location, directions, mapUrl }` supplied by the authorized server projection. Without it, the page renders only general IIIT Delhi/New Delhi information. There is no client permission guess, private default, private constant or additional fetch in Home. Maps links accept only the existing HTTPS Google Maps host/path families. The parent owns Portal `arrival=1` wiring; the reference-audit lane owns server audience, cache and integrated role verification. This standalone Home run does not claim those later integrated browser results.

## Verification receipt

All screenshots stay outside Git under `/tmp/ddd-home-followup/`:

- `before/`:12 actual baseline PNGs at1440×900,768×1024,390×844 and320×480, all viewed.
- `final/`:39 actual final-source PNGs, all viewed. This includes chapter incoming/overlap frames, expanded FAQ, original organizers plus the requested GitHub avatar, short CTA with settled lower dots, native touch scrolling, reduced motion and native zoom/navigation Back.
- `final/report.json`:61 browser checks passed, no page exceptions.
- `final/native-zoom-report.json`:4 checks passed. Actual Chromium default zoom was200%, `outerWidth=1440`, `outerHeight=900`, `innerWidth=720`, `innerHeight=378`, `visualViewport.height=378.5`, `devicePixelRatio=2`, `visualViewport.scale=1`. CDP screenshots preserve the1440×757 physical content viewport; filenames refer to the1440×900 outer window. This is native browser zoom, not CSS zoom or pinch.
- `final/settled-stress-report.json`:2 further checks passed. Temporary DOM-only long-agenda rows are clearly synthetic, not stored or published event content. The final marker is visible and no horizontal overflow occurs.
- `final-focused-tests.txt`:17 relevant Home, geometry and organizer tests passed. `final-typecheck.txt`:typecheck exited0. No standalone full build or performance improvement is claimed by this lane; parent integration runs final release checks.

The earlier `after/` folder is an interim pre-branding/pre-rail capture and is not the final target. The final manifest identifies only accepted baseline/final PNGs and their source hashes. The early short CTA frame catches falling dots; `final/cta-settled-bottom-320x480.png` shows the actual settled state after the existing entrance completes.

All browsers are closed. Owned Next3024 parent/child PIDs262070/262084 and synthetic backend8874 PID262125 were stopped; both listeners were verified closed. Generated `next-env.d.ts` was restored after shutdown. The owned synthetic SQLite fixture and all screenshots/reports remain outside Git under `/tmp/ddd-home-followup/`.

## Exact animation blocker

The requested one-by-one monument rise is not implemented. Actual pixels and source show a single flattened `delhi-fill-overscan` image containing all monuments, foliage, green background and faint lettering, plus a text mask and a separate static Metro. The retained `dc92672` asset tree contains the same flattened set; the retained Sites branch and bounded runtime asset history revealed no independent transparent monument layers.

Animating guessed rectangular slices would move neighboring scenery/background and would not be the requested independent-building sequence. Transparent, isolated monument layers or a separately authorized asset-preparation decision are still needed. This is a pending asset requirement, not a tool denial. Existing Delhi lettering, approved static artwork, parallax and stationary Metro are preserved.
