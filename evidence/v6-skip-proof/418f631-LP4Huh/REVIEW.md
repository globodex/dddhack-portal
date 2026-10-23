# Focused skip-link stacking defect

Source `418f6311c1e5a01831897b36f181eeda799c7911`, matching Worker `6e77794a8831ccb2594f3383171244b1dd9f4ec07c56633f1357ad101b4cfaf5` before and after.

Sandboxed Chromium, named fake Alice, localhost GET/HEAD only. At 390 × 844, 834 × 1194 and 1440 × 900, focusing Skip to content placed its box at x8, y8, width135, height45. Both the skip link and later sticky header had z-index100. Center hit testing returned a span inside `.mobile-header`, not the skip link. Original focused screenshots confirm that the skip link is obscured. All three originals were inspected directly.

Keyboard Enter still moved focus to `#main`. Touch/mouse activation of the focused link fails in the main role/control audit because the header intercepts it. Raising the skip link above the header is queued with the parent; this receipt does not prove that fix.

`report.json` records exact bounds, stacking and hit-test results. The three original PNGs remain local. This bounded proof browser is closed. The separate main audit browser was still running when this proof completed.
