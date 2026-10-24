# Landing and sign-in redesign QA

final result: passed

Owned implementation and integrated rendered states pass the checks below. Normal motion, reduced motion, the shared navigation and the compact-to-stacked chapter transition were captured and inspected in the parent preview. No owned P0/P1/P2 finding remains open. The parent owns the final repository-wide build and test suite.

## Source and visual target

- Production Next.js source, not a prototype scaffold.
- Final owned runtime: `532ae8a183f563bccf2f9bbd2da729fc9fab169e`. Final chapter integration source: `344334b220472641a07f1832485a6a387f9b8915`. Hero/navigation integration was captured at `09682b5c34e029a49ebd873bb4786083819e8abe` (runtime identical to `0f5f8236bcc30c3d6a6a5960eb2f24154ed89d19`); short normal-motion rest at `2de77edbe560be4197475f02da85412e616f9b92`.
- Main60-frame state matrix: `3dc7c1ccc91d7cde47602db6989644031fecd3de`. Later changes affect compact dot coordinates and sparse chapter sizing only.
- Before source: `696b125f9711a4fd6e02c3ece3adadb18b83cba7`.
- Selected target: Library `libfile_5c3333ebe2d881919233264ca1a2c7ea`, materialized and viewed at `/workspace/reference-evidence/devday-mobile-thumb-reachable-mockup.png`.
- Target853x1844px normalized proportionally to390x844 for comparison; implementation CSS viewport390x844, deviceScaleFactor1.
- Full comparison: [target, before and final](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-landing/mobile-target-comparison-final.png).
- Focused comparison: [CTA and settled expressions](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-landing/mobile-cta-detail-comparison-final.png).
- Full state matrix [report](../evidence/redesign-landing/report.json) and final hero [report](../evidence/redesign-landing/final-hero-report.json), including actual screenshot paths, source revisions and SHA-256 hashes.

## Concrete implementation

The compact hero uses separate grid rows for identity, metadata, side expressions, actions and the settled pile. Its CTA is618..676px at390x844 after hiding only the local fixture marker. Short390x480 screens grow naturally and scroll; a separate capture proves the CTA is reachable. Decorative layers are pointer-inert at every viewport.

The existing Delhi illustration and static Metro remain. Compact circles use existing DotAvatar expressions and palette; no artwork was generated. The global36-dot portrait backdrop and repeated chapter-side fields were removed from Home. Four side circles and eight pile circles replace overlapping mobile fields. Desktop retains its existing8+18 composition. Measured home positions include bounded edge cropping, preventing an unreachable target from keeping animation frames alive.

Schedule now renders exact configured items in a readable timeline. Placeholder content still says Agenda to follow. Venue, all eight rules and all seven FAQs retain their actual content. Chapter sizing keeps measured sticky behavior for populated Schedule, Rules and FAQ when content fits, with natural flow for short screens and reduced motion. Empty Schedule and sparse Venue always keep their content height, avoiding full-screen blank stages. Organizer portraits, crops, rings, cylinders and links remain.

Sign-in now pairs event identity with a focused form on desktop and a compact form on smaller screens. Contextual errors replace tinted banners. Google/email endpoints, JSON bodies, Google redirect allowlist and return-path handling remain. Method POST plus disabled controls before the first effect prevent a native GET submission before hydration. Privacy, Terms and Contact link to /privacy, /terms and mailto:hey@itsparam.in.

## Visual comparison history

1. Initial compact rendering wrapped the title to four lines and filled existing slots with the wrong expression symbols after recoloring. Corrected font specificity and paired-symbol updates before7e75820.
2. First complete comparison found side symbols partly clipped by viewport edges, circles settling above the chosen target and a low pile. Follow-upf4c531e/07b076d correct measured centers and pile offsets. Fresh geometry checks verify both marks fit while the circles retain edge cropping.
3. Integrated normal-motion inspection found sparse Schedule and Venue inherited full-height sticky panels.532ae8 keeps those two cases compact while preserving the populated timeline and Rules/FAQ stack. Nine fresh native captures at1440/768/390 confirm the fix; desktop heights are316px Schedule and274px Venue.
4. Final full and focused comparisons above show the chosen three-line title, separate date/host lines, lower CTA and visible pile. The shared64px navbar, approved Delhi asset proportions, warm paper palette and existing pause/scroll controls intentionally differ from the generated mock.

Required fidelity surfaces reviewed: DM Sans display/body hierarchy and wrapping; grid spacing and responsive rhythm; warm paper/ink and expressive colors; original sharp Delhi/Metro, real Codex/Google logos, existing expression assets and organizer portraits; exact app-specific content and action labels. No remaining owned P0/P1/P2 finding is known.

## Captured surfaces and behavior

Viewports:1440x900,768x1024,390x844 and390x480. Native image files are in [the evidence directory](../evidence/redesign-landing/README.md).

| Surface | States and observed behavior | Health |
| --- | --- | --- |
| Hero | Anonymous and signed-in; actual portal/dashboard href; trusted pointer/touch and Enter activation; readable paired marks; settled pile below CTA; reachable short-screen action | Passed |
| Schedule | Matching three-entry disposable fixtures before/after; exact08:00/09:00/16:00 values and descriptions; Agenda to follow compact at1440/768/390 | Passed |
| Venue and Rules | Public IIIT Delhi/New Delhi; all eight rules; no horizontal overflow | Passed |
| FAQ | All seven questions, native expanded/collapsed states, Enter and touch toggles | Passed |
| Organizers | Original portraits and colored ring/cylinder composition at all four sizes | Preserved and viewed |
| Sign-in | Empty, native email validation, server field error, email loading, synthetic success, Google proof error, Google loading; all requests intercepted and no email/provider calls | Passed |
| Sign-in navigation | Full-screen opening, one row per link,16px icon gap, Escape and browser Back closing with focus return, including390x480 | Passed |
| Motion | Reduced-motion pixel stability and offscreen stop on all four viewports; cropped home position settles without a perpetual animation loop | Passed |

Integrated normal-motion and shared-navigation capture produced24images and4viewport groups with0page errors or writes. That visual review found the sparse chapter issue described above. After the fix,9native images and3viewport groups confirm the corrected transition. A final390x480 normal-motion rest screenshot shows the clear CTA at254..312px and eight settled circles below at312..480px. The reports bind source revisions and runtime fingerprints. These runs shared local resources with the parent suite; they provide no performance comparison.

The main matrix produced60captures and9interaction groups with0page errors. Final hero/Google-loading follow-up produced13captures and4groups with0page errors. Automated Axe found0violations on the390x844 Home and Sign-in checks; this is not a claim of complete accessibility compliance. Screenshot originals and1:1 short-screen inspection sheets were opened.

## Verification and performance limits

- TypeScript passed.
-24focused tests passed, including cropped-dot settling, Home content, conditional Delhi loading and offline auth.
-Production `next build --webpack` passed.
-Default Turbopack build failed to resolve Next through this isolated worktree's external node_modules symlink. No config was changed to bypass that boundary. The parent's ordinary build in the physical dependency root remains required.
-Local development observations: desktop DOM nodes704 to521, tablet872 to472, mobile676 to472. Resource requests stayed13 before/after. These are diagnostic observations, not hosted speed or capacity claims.
-Baseline3014 and owned preview3004 were stopped after capture to release memory. The only owned backend left is8897 with `/tmp/ddd-landing-ui.sqlite`, containing explicitly synthetic agenda entries.
-Default/public event content, production data, credentials, provider settings and published state were not changed.
-Real Google login, SMTP delivery, physical devices, legal page publication and the parent's final repository-wide build remain outside this child lane's verified outcome. Integrated central navigation is verified above.

## Integration commits

Owned implementation commits in order:7e75820,26eb638,40f804e,3dc7c1c,f4c531e,07b076d,532ae8. All are already integrated by the parent. This final handoff adds only documentation and original browser evidence. Skipca195d2, which only consumes the parent's5b622c8. Every owned commit was explicitly verified with both author and committer Parampreet Singh <rubercuber.30@gmail.com>.

