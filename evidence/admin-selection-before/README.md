# Actual stale-selection baseline

Root source and portal SHA-256 are in [report.json](report.json). Viewport **390 x 480** with real local synthetic Common Ground records, no DOM or response overrides.

1. Dave started Going, unchecked in, in a Locked team. Only his status was temporarily set Registered.
2. The UI filtered exact `dave@portal.test`, Registered and Locked. The single visible row was selected and updated to Going through the actual approval action and confirmation.
3. The filtered list correctly became **0 participants**, while **1 selected** remained. The toast incorrectly said **“You’re Going. Individual approvals updated.”**

Both screenshots were opened and inspected: [full page](before-stale-selection-full.png), [short viewport](before-stale-selection-short.png). These are original native PNG files.

Dave and Carol were verified restored to their original Going/null checked-in states. No identity, membership, team, project, Bob, Alice, or production data changed. The browser context closed. This is baseline failure evidence; the selection/check-in fix `4733a1d` was intentionally not integrated yet.
