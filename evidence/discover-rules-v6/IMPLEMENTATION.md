# Discover / other profile / Rules visual lane

Base integration `e0fbc27`. Selected source boards were opened directly: `main-pages-v3/03-discover-and-profile.png` and Rules center panel in `08-team-rules-owner-logs.png`; `DELIVERY-INDEX.md` corrections take precedence. Original social SVGs, participant expressions, team initials and named Lucide controls are reused. No generated identity image, private data, helper box or event policy was introduced.

## Reference measurements and source choices

Board03 has a desktop main content region roughly736px wide after a230px sidebar, 30px main gutters, a52-60px expression heading avatar, underline People/Teams tabs, a48px search row and horizontal membership pills. People rows use56px expressions,17-18px names,14px bios, compact membership state, authentic social icons and a44px trailing profile target. Rows target104px minimum on desktop and grow naturally for real content. The shell/sidebar remains root-owned.

The Teams phone panel uses a56px initials circle, name/count grouped, a compact status pill, then one full-width44px join/view control. Eligible teamless members retain Create team. Viewers can inspect safe Team details without join/create controls; full/locked teams expose only safe details. Pending join requests remain disabled.

The other-profile panel centers an80px selected expression,28px name,16px bio and44px social targets. Its Team card contains only public team name and optional palette. The generated bottom helper box is omitted. Existing native dialog Escape/close/focus-return lifecycle is preserved. No contact, email, demographic, organization ID, voucher or private idea fields render.

Rules uses the existing five server categories, first initially open. Header has a real back icon and orange expression. Summary rows target68-70px,16-17px semibold labels,22px chevrons; open content is a numbered list with14-15px text. Actual authoritative rule text is retained even where it is longer than the illustrative mock.

## Integration

Root should import `app/discover-rules-v6.css` in layout after existing common styles. Only Discover/projection/dialog/Rules sections in portal.tsx, discovery-profile.tsx and a new scoped stylesheet change. No common stylesheet or backend edits. People rows already provide avatarColor/avatarExpression. Optional safe teamPalette is not yet in the API People projection; root can add it for the Team card’s actual selected color. No invented team/profile route was added.

## Coordinated actual QA plan

No preview or browser was started in this lane. After root supplies a matching compiled artifact, capture1440x900,1194x834,834x1194,390x844 and320px narrow for People, Teams, member profile modal and Rules. Compare actual original captures with selected board panels at matching states. Check tabs, search, all membership filters, native profile/team close and Escape/focus return, safe team metadata, request disabled state, eligible teamless Create team, viewer/teamed-member restrictions, first-open Rules plus all category toggles, long real names/bios, all five socials, keyboard focus,200%zoom and no horizontal spill. Keep profile/dashboard priority captures ahead of this lane. Screenshot comparison remains pending; no visual acceptance or publication claim.
