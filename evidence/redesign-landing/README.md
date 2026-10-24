# Actual landing and sign-in browser evidence

All screenshots use disposable local fixtures. Final owned source: `532ae8a183f563bccf2f9bbd2da729fc9fab169e`. Final integrated chapter source: `344334b220472641a07f1832485a6a387f9b8915`. Hero/navigation integrated source: `09682b5c34e029a49ebd873bb4786083819e8abe` (runtime identical to0f5f823); final short normal-motion rest: `2de77edbe560be4197475f02da85412e616f9b92`. Earlier hero source: `07b076d`. State matrix source: `3dc7c1c`; later changes adjust compact circle coordinates and sparse chapter sizing. Images are original browser screenshots unless labelled comparison or inspection sheet.

- [Integrated normal-motion mobile hero](integrated/normal-hero-390x844.png)
- [Integrated short mobile, CTA and settled pile](integrated-final/normal-short-cta-settled-390x480.png)
- [Integrated full-screen mobile navigation](integrated/shared-signin-navigation-390x844.png)
- [Compact Schedule, Venue and Rules on desktop](integrated-final/compact-schedule-venue-1440x900.png)
- [Compact Schedule, Venue and Rules on tablet](integrated-final/compact-schedule-venue-768x1024.png)
- [Compact Schedule, Venue and Rules on mobile](integrated-final/compact-schedule-venue-390x844.png)
- [Final signed-in mobile hero](final-signed-in-hero-390x844.png)
- [Final anonymous mobile hero](final-hero-390x844.png)
- [Final tablet hero](final-hero-768x1024.png)
- [Final desktop hero](final-hero-1440x900.png)
- [Short mobile CTA after natural scrolling](final-short-cta-reachable-390x480.png)
- [Mobile sign-in](after-signin-empty-390x844.png)
- [Desktop sign-in](after-signin-empty-1440x900.png)
- [Contextual field error](after-signin-error-390x844.png)
- [Email loading](after-signin-loading-390x844.png)
- [Google loading](final-signin-google-loading-390x844.png)
- [Mobile populated timeline](after-schedule-390x844.png)
- [Desktop populated timeline](after-schedule-1440x900.png)
- [Mobile rules](after-rules-390x844.png)
- [Mobile FAQ](after-faq-390x844.png)
- [Preserved mobile organizers](after-organizers-390x844.png)
- [Selected target with before and final](mobile-target-comparison-final.png)
- [Focused CTA comparison](mobile-cta-detail-comparison-final.png)

The timeline's three entries are labelled synthetic and are not published event timings. Authentication responses are intercepted fixtures; no real email or Google login was attempted.

[Integrated normal-motion/navigation report](integrated/report.json), [final compact-chapter report](integrated-final/report.json), [short normal-motion rest report](integrated-final/short-rest-report.json), [full60-frame matrix](report.json), [final13-frame follow-up](final-hero-report.json) and [QA review](../../docs/LANDING_SIGNIN_REDESIGN_QA.md) record the source revisions, states, viewport geometry, checks and exact image hashes. All before/after/final originals are preserved beside this index. Only the local fixture banner and Next development overlay were hidden in these normalized captures.


The integrated24-frame set intentionally preserves the sparse full-height chapter finding before532ae8. The integrated-final captures verify its correction. The immediate short CTA frame in the earlier set precedes resumed pile settling; use the final short rest image for the settled composition.
