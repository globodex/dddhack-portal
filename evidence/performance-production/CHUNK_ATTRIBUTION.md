# Exact initial Dashboard payload attribution

This is offline analysis of the accepted original696 versus2657 production comparison, not a new measurement or modification of the validated e135 checkpoint. The existing built artifacts are read directly. [Module ranges](chunk-modules.json), [CSS source matches](css-chunks.json), [headers/waterfall](chunk-header-attribution.json), and [component ranges](component-ranges.json) make the boundaries reproducible.

## CSS: exact23,310-byte wire increase

| Compiled CSS before → final | Wire before | Wire final | Delta | Source ownership |
|---|---:|---:|---:|---|
|614a4aca →8809e623|13,447|14,091|+644|style/public-home/home-lower/organizer-section/portrait-backdrop. Growth is public landing/organizer styling; paid on Dashboard through root layout.|
|6e698558 → identical|13,326|13,326|0|participant-ui, admin-controls, navigation-correction, discovery-profile, dashboard-v6. Byte-identical compiled chunk.|
|1df01e94 →eb86810a|7,068|12,188|+5,120|Existing discover/rules/submission/shell/mobile CSS plus enlarged loading and credit inventory sheets, new personal credits, redesign tokens/shell and profile-experience.|
|none →3be7d25f|0|12,808|+12,808|team-discovery-experience (~31K matched minified rule bytes), admin-experience (~25K), projects-rules-experience (~24K), team-studio-shell (~3K).|
|none →55bbc64a|0|4,738|+4,738|team-studio-experience; ~25K matched minified rule bytes.|
|Total|33,841|57,151|**+23,310**||

The compiled client-reference manifest assigns all five final CSS files to `app/layout`. They are global dependencies, not on-demand Studio assets. In the expanded eb86810a chunk, source matching identifies roughly8K profile rules,8K redesign,4K personal-credit rules,10K credit-batch rules and6K loading rules, in addition to unchanged common rules. Most admin/project/profile rules do not match the initial Dashboard DOM, but they remain necessary for those routes and interaction states. Deleting apparently unused rules is not established safe.

The CSS matcher uses the installed Next cssnano settings, then matches compiled selector/context/declaration signatures to minified source rules. It reports exact matched raw rule bytes, unmatched/ambiguous rules and wrapper/font-face overhead. Compression spans source boundaries; **source-level gzip figures are not additive and cannot uniquely apportion23,310 bytes**. The whole-chunk wire values above are exact observed transfer values including protocol overhead. No client source maps or webpack stats were emitted by these original builds; trace-build contains timings only.

Median last blocking CSS completion rose233.4→320.9ms. Median last font completion rose319.9→456.7ms; FCP436→596ms. The new3be7d25f global admin/project/discovery chunk is the last blocking stylesheet in3/7 final cold Dashboard observations; the new Studio stylesheet is last in1/7. This is concrete critical-path delivery cost, not evidence that every matched rule executes during layout.

## JavaScript: exact14,385-byte wire increase

React/runtime/common chunks8706df1e,636 andmain-app are byte-identical. The changed closure is:

| Chunk/group | Before wire | Final wire | Delta |
|---|---:|---:|---:|
|Webpack runtime|2,161|2,207|+46|
|Old page chunk +992 shared app chunk|55,941+33,001 =88,942|replaced||
|Final page chunk +330 +46 app chunks||588+34,556+68,137 =103,281|+14,339|
|Total changed closure|||**+14,385**|

The baseline page's module8350 is a199,664-byte minified concatenation of PortalClient and presentation imports. The final module6046 is229,710 bytes (+30,046 raw). Final chunk46 additionally exposes separate shared modules: PersonalCredits4,734 raw bytes, MobileNavigation2,077, CreditInstructions1,986, HeadingDot1,565, feedback1,539, dialog history1,085, information navigation1,013, DotAvatar682, avatar contract642 and time172. Some code moved out of the original concatenated module; it is incorrect to count every separate module as newly added code. Existing large Zod module6361 remains84,117 raw bytes in both versions and is not the regression.

Stable source-specific JSX markers identify exact minified function subsets:

| Function | Before raw bytes | Final raw bytes |
|---|---:|---:|
|TeamWorkspace|5,727|11,721|
|ProfileFlow|4,736|6,499|
|AdminCreditBatches|4,284|6,499|
|Submission|9,244|10,691|
|Home outer component|3,438|3,723|

These exclude imported helpers, child functions and data. The Home outer component alone is not the full Home closure (Delhi art, chapter/organizer components and helpers are separate functions). Because webpack concatenates modules and gzip shares a dictionary, exact compressed attribution to individual source files is not unique without original source-map/stats boundaries. The AST ranges and exact chunk closure are preserved instead of inventing such numbers.

## Encoder-only boundary estimate

[Actual compiled encoder ranges](encoder-compiled.json) identify3,890 nonoverlapping minified bytes: prepareProjectImage including inlined header inspection and blob/canvas helpers3,509; policy200; error class121; demand45; JPEG quality array15. Removing those exact ranges and recompressing the existing chunk estimates **1,582 gzip bytes marginal**, not a valid rebuilt chunk or a timing result. The header decoder is dependency-free and brings no hidden heavy package. Deferring this path until a file is selected is a defensible small boundary, but cannot account for most of14,385JS bytes or establish a160ms improvement. Root chose a separate Home SSR-true dynamic-import candidate instead; no encoder change was made here.

## Headers and cache

Both versions use HTTP/1.1. HTML is private/no-cache/no-store/max-age0/must-revalidate, gzip, and Vary includes RSC routing plus Accept-Encoding. CSS/JS are public31536000immutable with gzip. WOFF2 fonts are immutable with native compression and no Content-Encoding. Public SVG assets use max-age0. ETag values naturally differ with artifacts; policy does not. Actual repeat network requests remain6 on Dashboard and5 on People; additional static chunks hit the browser cache. There is no demonstrated cache-header regression or extra bootstrap backend fetch.

No source or fixture data changed during this attribution. No browser, server, timing rerun, provider call, push or deployment was performed. Any new candidate comparison must use a fresh output directory and explicit candidate source/build identity, with a fixed stopping criterion.
