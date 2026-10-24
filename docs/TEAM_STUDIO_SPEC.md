# Selected TeamStudio implementation

Exact user-selected target: Library `libfile_f7d0d261d73c8191bb726a86f2f1a0df`, materialized `/workspace/library-files/team-studio/selected.png`,1487×1058 native pixels, opened and viewed before editing. Product Design image-to-code workflow applies within this production Next.js app; reuse supplied logos/avatar assets and installed Lucide. No generated artwork or new dependencies.

At1487px the target has44px side gutters, a roughly86px brand/header row,55px tab row,150px team initials circle and a large76px name. The horizontal member row uses86px avatar circles, with names and actual social/WhatsApp contacts. A divider at about505px introduces a60/40 idea/next-action split with44px gap. Idea has a quiet privacy label, truthful Saved state, title and description; the card is deliberately prominent with one real next action. A four-stage progress line anchors the page below.

Implementation reuses existing common header/menu, suppresses the Dashboard sidebar only through root-owned shell hooks, and removes the repeated Dashboard title. Team identity colors come from the team's current palette and a human color name. Draft title/description are controlled; Saved appears only when persisted values match, length is computed from the actual description, and lock requires a saved idea. Existing rename/color/invite/remove/delete permissions and confirmations remain, exposed through compact dialogs/details rather than repeated full panels. All team-only contacts stay inside the existing authorized payload.

The next-action card reflects saved idea, lock state, personal check-in, server submission-window/leader/attempt permissions and existing project history. Team timeline check-in uses actual team-status evidence, distinct from the person's check-in; it never adds a new lock prerequisite or implies everyone is checked in from a personal flag.

Mobile320/390px stacks identity/member rows and idea/card without horizontal clipping; short480px uses normal page scrolling.768px and native200% collapse before columns become cramped. No fixed footer covers fields. Existing generic profile onboarding and public/admin layouts remain untouched.

Verification: compare the selected pixels with actual1487×1058,1440×1024 and1440×900 renderings, then768/390/320 and390×480; inspect images, tab keyboard behavior, open/close/Escape/Back, actual synthetic idea-save/lock/member permissions. No page-ready claim follows from compilation alone.
