# Team creation dialog repair

Source for the first clean after set: `af98d32505976cbdf94cd2f949646f1ec088e5a9`. Follow-up `b472b4fb390f96763816fc98ef17270efeb54f5d` restores POST, inert and busy hydration guards without changing the layout.

The three native screenshots in `rejected-before/` are source `e1209bc` and are **rejected evidence**, including the disturbed 390 x 480 arrangement. They were viewed before changes. They are not a passed design target.

The replacement uses a single header, scrolling body and action footer. The title and 44 px close control share an in-flow row. One initials preview and eight hidden accessible radios are grouped together; the radio labels retain at least 44 px touch targets, including at 320 px. The public Team intro remains optional and is separate from the private saved idea.

First rendered after screenshots:

- [Desktop 1440 x 900](create-team-after-1440x900.png)
- [Mobile 390 x 844](create-team-after-390x844.png)
- [Short mobile 390 x 480](create-team-after-390x480.png)
- [Short mobile after internal scroll](create-team-after-390x480-scrolled.png)
- [Narrow mobile 320 x 480 with 80-character team name](create-team-after-320x480.png)
- [Narrow mobile after internal scroll](create-team-after-320x480-scrolled.png)

The desktop, 390 px full-height and short states, short scrolled state, and narrow 320 px rendering were inspected as actual pixels. `first-capture-report.json` records viewport, header/body/footer geometry and source. These screenshots use local synthetic fixture data on localhost:3002, with no production requests. The CTA remains inside the viewport while the form body scrolls; horizontal document overflow was checked. This checkpoint records the replacement and does not claim user acceptance.

Focused controls, persisted creation and native browser zoom evidence will be recorded in the final focused QA checkpoint.
