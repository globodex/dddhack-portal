# Local credit UI fixtures

Run from the backend worktree. The helper refuses an existing database or output file, requires local test mode and blocks external fetches. Every code and account is synthetic. It writes CSV files without logging their values. Use a fresh `/tmp/ddd-credit-*.sqlite` path for each scenario.

```sh
PORTAL_LOCAL_TEST=1 PORTAL_LOCAL_DB=/tmp/ddd-credit-ui.sqlite node --import tsx scripts/credit-stock-ui-fixture.ts
```

Default state:50 Total,10 Assigned,40 Available,0 Waiting. The checked-in admin owns a credit despite a pending member in their team. The generated report contains the next10 Going emails; checking those in through the normal UI gives50/20/30. The generated restock CSV adds100 codes to the same published category without replacing its heading or Markdown.

For the genuine legacy waiting state, where stock was already published and the old quick check-in did not allocate to a later admin:

```sh
PORTAL_LOCAL_TEST=1 CREDIT_UI_LEGACY_WAITING=1 PORTAL_LOCAL_DB=/tmp/ddd-credit-ui-legacy.sqlite node --import tsx scripts/credit-stock-ui-fixture.ts
```

This starts with50 Total,9 Assigned,41 Available,1 Waiting. The admin is already personally Checked in and has no allocation. GET remains read-only. `repair-credit-allocations {}` changes the state to50/10/40/0, assigns the admin and preserves every existing recipient/code. No recheck-in, dummy restock, mapping deletion or code recycling is involved.

For the Out of stock personal state:

```sh
PORTAL_LOCAL_TEST=1 CREDIT_UI_LEGACY_WAITING=1 CREDIT_UI_INITIAL_STOCK=5 PORTAL_LOCAL_DB=/tmp/ddd-credit-ui-exhausted.sqlite node --import tsx scripts/credit-stock-ui-fixture.ts
```

This starts5/5/0/5, with the personally checked-in admin unallocated and `exhausted:true`. The UI should show Out of stock and no fake mask/Reveal/Copy. Assign waiting applies only where Available and Waiting are both positive.

The helper does not start Next or the backend. For the reserved UI lane, start the existing local backend against that chosen database on8841 with `APP_ORIGIN=http://localhost:3003`; frontend3003 points to it. Do not mutate shared8821. No hosted schema or deployment action is performed.
