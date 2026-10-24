# Submission media: completed synthetic flow

App source `28ebbfc81a49ab839316b0d9121902e3cf645173`; positive jobs ran at metadata-only successors `32dadb2` and `a99970d`. Application fingerprints match the read-only48-PNG matrix. The fixture is private8834, entirely synthetic; no provider calls or production data changed.

The completed actions were exactly one real Save draft (HTTP200, revision2→3, attempts remain2), one real third Submit (HTTP200, revision3→4, attempts2→3), and one root-authorized fake-owner eligibility approval (HTTP200) for that version. Version receipt: `77bb4d63-eee2-4ee3-9423-a08e8e3b5501`. The two earlier version hashes remain unchanged. Current project is read-only and history has three immutable versions. No fourth submission was issued.

Original positive screenshots and receipts:

- `submission-media-positive-confirmed/save-draft-confirmation.png`
- `submission-media-positive-confirmed/save-draft-success.png`
- `submission-media-positive-resume/third-submission-confirmation.png`
- `submission-media-positive-resume/third-submission-success.png`
- `submission-media-positive-resume/three-immutable-versions.png`
- `submission-media-positive-resume/portrait-in-dashboard-mobile.png`
- `submission-media-positive-resume/public-full-aspect-1440.png`
- `submission-media-positive-resume/public-full-aspect-390.png`

The portrait remains128×300, `object-fit: contain`, with current server-resolved team wash `rgb(232,247,239)` in editor, Dashboard and public detail. The logo remains transparent at its center. Actual desktop/mobile success and public PNGs were viewed. The main read-only set additionally verifies square, extreme ultrawide, JPEG, EXIF orientation/metadata stripping, exact1/5MB limits, local errors, remove/replace,320/tablet/short-mobile/native200%, confirmation Escape/Back and zero overflow/writes.

Two harness stops are preserved, not hidden. `submission-media-positive/report.json` omitted the existing Save draft confirmation and timed out with zero POSTs, revision2/attempt2 independently unchanged. The corrected job then confirmed and saved once, but focused a hidden Step3 upload control after the successful refresh remounted the editor atStep1; its immediate toast-count assertion failed. This did not represent a visible-field interaction or show a product failure. The future harness now focuses a visible Project name input and waits for the toast state. The completed resume job explicitly required the prior save receipt and R3/A2; its write guard allowed only the single Submit. No Save was replayed. Toast clearing after a visible input focus was not independently rerun in this completed state, because that would require another save or a mocked UI state.

Source unit checks passed for pre-decoder MIME/byte/structure/dimension rejection (zero decoder/object-URL side effects), current public team-color refresh without extra SQL, form privacy and the updated any-aspect rules. Root integrated typecheck passed. Full combined tests/build/performance remain the root's final gate.
