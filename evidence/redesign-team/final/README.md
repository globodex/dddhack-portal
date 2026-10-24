# Team and discovery evidence

Runtime source: `6a65f391aa0f6ad30ee7b34b2c6662baf541ec35`, branch `feat/team-discovery-experience`. These captures use the real Next.js frontend and disposable local SQLite-backed API. All names, profiles, phones, teams and actions in this folder are synthetic.

## Implementation

- Team identity, membership and private idea are distinct regions. Desktop places members and idea side by side; tablet/mobile stacks them. One Team settings disclosure replaces four oversized disclosures.
- Existing invitation APIs now have leader send and recipient accept/decline controls. Requests, removal, private idea save, team lock, personal Credits and Project gates retain existing server contracts.
- Create team uses a native dialog. Eight accessible color radios are visually hidden behind compact swatches; one initials preview and selected color name update together. The short mobile action stays visible while form content scrolls.
- Discovery retains server search and cursor pagination. Private profiles stay compact without invented content. Populated cards use actual permitted bio/social/team fields. Loading cards keep avatar/content/footer geometry; errors expose Retry.

## Checks

1. Team invitation, recipient touch acceptance, membership request acceptance, removal and creation: passed against the real synthetic API with existing confirmations. See the parent directory `interaction-report.json` for the scoped12-check sequence.
2. Saved private idea and team lock: passed. Locked views remove edit controls. The existing synthetic HTTP test also verifies pending-registration teams can lock after saving an idea.
3. Participant profile keyboard, Escape and browser Back: passed, including opener focus restoration through the centrally owned helper.
4. Search loading, error, Retry and no matches: passed. The503 response is deliberately injected for the error capture; normal search uses the real API.
5. Real pagination:24 initial records plus13 unique records from one cursor request. A separate run disables the observer to isolate Enter on Load more; it also makes exactly one real cursor request.
6. Search outside the first page: real API finds exactly `Synthetic Control Project24 Builder`. Actual participant response items exclude email, phone, WhatsApp, private idea, credits and organization ID keys.
7. Desktop1440x900, tablet768x1024, mobile390x844 and short390x480: no horizontal overflow or uncaught page errors. Native PNGs use deviceScaleFactor1 and reduced motion. Fresh contexts prevent browser scroll-restoration artifacts.
8. Automated mobile Axe checks for Dashboard, participants and create dialog: zero WCAG A/AA violations in all three states. This does not establish full accessibility compliance.
9. TypeScript and20 focused source/server tests: passed after the last implementation change. Full repository build/test/performance checks belong to integration.

## Limits

The accepted Dashboard board is an illustrative1774x887 composite. `dashboard-reference-comparison.png` places it beside the actual1440x900 render. The latest written spec deliberately changes desktop members/idea placement and warm colors, so this is an information hierarchy and asset comparison, not a pixel identity claim. The fixture includes two team members, whereas the board has three. No protected exact venue is invented for the fixture.

Screenshots prove this source and local synthetic state. Real sign-in, production behavior, physical devices and hosted speed remain unverified here. Chromium needs its sandbox disabled in this container. No provider, deployment, credential or production data change occurred.
