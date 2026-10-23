import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setup, attend, submission } from "./helpers";
import { handlePortal } from "../lib/http";
import { one, rows } from "../lib/db";
import { fixtures } from "../scripts/fixtures";
import {
  operationalSetupRequest,
  operationalSetupSave,
  indefiniteRetentionNotice,
  optionalDeploymentRule,
} from "../lib/operational-setup-contract";
import { draftPolicy, setupReadiness } from "../lib/policy";
import { ConfirmationGate } from "../lib/action-confirmation";
import OwnerOperationalSetup from "../app/owner-operational-setup";
import { Settings, portalConfirmationFor } from "../app/portal";
type Row = Record<string, any>;
const request = (
  version: number,
  operation: "submissions" | "checkin" = "submissions",
) =>
  operationalSetupRequest({
    version,
    operation,
    privacyConfirmed: true,
    rulesConfirmed: true,
    reason: "Synthetic owner operational setup",
  });
function post(
  db: any,
  action: string,
  data: unknown,
  name = "owner",
  origin = "https://portal.test",
) {
  return handlePortal(
    new Request("https://portal.test/api/portal", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ action, data }),
    }),
    { db, identity: fixtures[name], key: undefined },
  );
}
async function settings(db: any) {
  const response = await handlePortal(
    new Request("https://portal.test/api/portal?view=/admin/settings"),
    { db, identity: fixtures.owner, key: undefined },
  );
  assert.equal(response.status, 200);
  return (await response.json()) as Row;
}
async function save(
  db: any,
  version: number,
  operation: "submissions" | "checkin",
) {
  const values = request(version, operation),
    response = await post(db, "preview-operational-setup", values);
  assert.equal(response.status, 200);
  const preview = (await response.json()) as Row;
  const committed = await post(
    db,
    "save-operational-setup",
    operationalSetupSave(values, preview as any),
  );
  assert.equal(committed.status, 200);
  return { values, preview, result: (await committed.json()) as Row };
}
test("legacy setup API remains auditable while Settings derives operations without enable controls", async () => {
  const { db, service, clock } = await setup();
  try {
    await db.prepare("DELETE FROM event_settings").all();
    let view = await settings(db);
    assert.equal(view.policyVersion, 0);
    assert.equal(view.readiness.initialized, false);
    let markup = renderToStaticMarkup(
      createElement(Settings, {
        data: view,
        run: async () => {
          throw new Error("Rendering cannot mutate");
        },
      }),
    );
    assert.doesNotMatch(markup, /Event controls/);
    assert.doesNotMatch(markup, /Preview operational setup/);
    assert.doesNotMatch(markup, />Enable check-in</);
    assert.doesNotMatch(markup, />Enable submissions</);
    const before = await one(db, "SELECT * FROM event_settings");
    assert.equal(before, undefined);
    const values = request(0, "checkin"),
      p = await post(db, "preview-operational-setup", values);
    assert.equal(p.status, 200);
    const preview = (await p.json()) as Row;
    assert.equal(preview.enablesOperations, false);
    assert.equal(await one(db, "SELECT * FROM event_settings"), undefined);
    // The retained legacy builder supplies an audited policy edit; readiness needs no enable call.
    const saved = await post(
      db,
      "save-operational-setup",
      operationalSetupSave(values, preview as any),
    );
    assert.equal(saved.status, 200);
    view = await settings(db);
    assert.equal(view.readiness.initialized, true);
    assert.equal(view.readiness.checkin.configured, true);
    assert.equal(view.readiness.checkin.enabled, true);
    assert.equal(view.readiness.submissions.enabled, false);
    assert.equal(view.readiness.scoring.ready, false);
    markup = renderToStaticMarkup(
      createElement(Settings, { data: view, run: async () => ({}) }),
    );
    assert.doesNotMatch(markup, />Enable check-in</);
    const enable = await post(db, "activate-operations", {
      operation: "checkin",
      version: view.policyVersion,
      reason: "Synthetic independent check-in enablement",
      confirmation: "ENABLE_CHECKIN",
    });
    assert.equal(enable.status, 200);
    view = await settings(db);
    assert.equal(view.readiness.checkin.enabled, true);
    assert.equal(view.readiness.submissions.enabled, false);
    assert.equal(view.readiness.scoring.ready, false);
    // A fresh database has no persisted submission deadline. Configure actual dates
    // through the version-bound owner date action, not an operational acknowledgment.
    const dates = {
      open: draftPolicy.submissionOpen,
      close: draftPolicy.submissionClose!,
      reason: "Synthetic actual persisted window",
    };
    const datePreview = await post(db, "preview-submission-window", dates);
    assert.equal(datePreview.status, 200);
    const dateValues = (await datePreview.json()) as Row;
    const dateSaved = await post(db, "publish-submission-window", {
      ...dates,
      version: dateValues.version,
      token: dateValues.token,
      confirmation: "CHANGE_SUBMISSION_WINDOW",
    });
    assert.equal(dateSaved.status, 200);
    view = await settings(db);
    const latest = await save(db, view.policyVersion, "submissions");
    assert.equal(latest.preview.open, draftPolicy.submissionOpen);
    assert.equal(latest.preview.close, draftPolicy.submissionClose);
    assert.equal(latest.preview.retentionNotice, indefiniteRetentionNotice);
    view = await settings(db);
    assert.equal(view.readiness.checkin.enabled, true);
    assert.equal(view.readiness.submissions.enabled, true);
    assert.equal(
      (
        await post(db, "activate-operations", {
          operation: "submissions",
          version: view.policyVersion,
          reason: "Synthetic independent submissions enablement",
          confirmation: "ENABLE_SUBMISSIONS",
        })
      ).status,
      200,
    );
    view = await settings(db);
    assert.equal(view.readiness.checkin.enabled, true);
    assert.equal(view.readiness.submissions.enabled, true);
    assert.equal(view.readiness.scoring.ready, false);
    const policy = (await service("owner").settings()).policy;
    assert.equal(policy.retentionNotice, indefiniteRetentionNotice);
    assert.equal(policy.lumaRequired, false);
    assert.equal(policy.deploymentRule, optionalDeploymentRule);
    for (const flag of [
      "judging",
      "diversity",
      "aiFallback",
      "feedback",
    ] as const)
      assert.equal(policy.confirmations.includes(flag), false);
    await assert.rejects(service("owner").command("compute-results", {}), {
      code: "POLICIES_UNCONFIRMED",
    });
    // Still enforce the genuine event, leader and attendance gates for application writes.
    await attend(db, "fake_alice");
    clock("2026-11-01T04:00:00.000Z");
    await service().command("submit", submission);
    assert.equal(
      (await rows(db, "SELECT * FROM submission_versions")).length,
      1,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM event_policy_history")).length,
      3,
    );
  } finally {
    db.close();
  }
});
test("false, missing, forged or mismatched acknowledgements/previews cannot initialize or change policy", async () => {
  const { db } = await setup();
  try {
    await db.prepare("DELETE FROM event_settings").all();
    const good = request(0, "checkin");
    const missingPrivacy = { ...good } as any;
    delete missingPrivacy.privacyConfirmed;
    const missingRules = { ...good } as any;
    delete missingRules.rulesConfirmed;
    for (const data of [
      { ...good, privacyConfirmed: false },
      { ...good, rulesConfirmed: false },
      missingPrivacy,
      missingRules,
      { ...good, privacyConfirmed: "true" },
      { ...good, rulesConfirmed: 1 },
      { ...good, operation: "all" },
      { ...good, active: true },
      { ...good, confirmations: ["judging"] },
      { ...good, weights: { ai: 0 } },
    ]) {
      const r = await post(db, "preview-operational-setup", data);
      assert.equal(r.status, 422);
      assert.equal(await one(db, "SELECT id FROM event_settings"), undefined);
    }
    const previewResponse = await post(db, "preview-operational-setup", good);
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()) as any;
    assert.ok(preview.token);
    for (const data of [
      good,
      { ...good, token: "forged", confirmation: "CONFIRM_OPERATIONAL_SETUP" },
      { ...good, token: preview.token },
      { ...good, token: preview.token, confirmation: "ENABLE_SUBMISSIONS" },
      {
        ...good,
        token: preview.token,
        confirmation: "CONFIRM_OPERATIONAL_SETUP",
        operation: "submissions",
      },
      {
        ...good,
        token: preview.token,
        confirmation: "CONFIRM_OPERATIONAL_SETUP",
        reason: "Different reason after preview",
      },
      {
        ...good,
        token: preview.token,
        confirmation: "CONFIRM_OPERATIONAL_SETUP",
        rulesConfirmed: false,
      },
    ]) {
      const r = await post(db, "save-operational-setup", data);
      assert.equal(r.status, 422);
      assert.equal(await one(db, "SELECT id FROM event_settings"), undefined);
    }
  } finally {
    db.close();
  }
});
test("owner role, authenticated identity and same-origin request protection apply to preview, save and scope activation", async () => {
  const { db } = await setup();
  try {
    await db.prepare("DELETE FROM event_settings").all();
    for (const name of ["admin", "judge", "alice", "stranger"]) {
      for (const action of [
        "preview-operational-setup",
        "save-operational-setup",
      ]) {
        const r = await post(
          db,
          action,
          {
            ...request(0),
            token: "fake",
            confirmation: "CONFIRM_OPERATIONAL_SETUP",
          },
          name,
        );
        assert.equal(r.status, 403, name + action);
      }
    }
    const anon = await handlePortal(
      new Request("https://portal.test/api/portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://portal.test",
        },
        body: JSON.stringify({
          action: "preview-operational-setup",
          data: request(0),
        }),
      }),
      { db, identity: null, key: undefined },
    );
    assert.equal(anon.status, 401);
    assert.equal(
      (
        await post(
          db,
          "preview-operational-setup",
          request(0),
          "owner",
          "https://untrusted.example",
        )
      ).status,
      403,
    );
    assert.equal(await one(db, "SELECT id FROM event_settings"), undefined);
  } finally {
    db.close();
  }
});
test("configuration preserves custom dates, active scopes, weights and unresolved judging flags; stale saves do not duplicate history", async () => {
  const { db, service } = await setup();
  try {
    const custom = {
      ...draftPolicy,
      submissionOpen: "2026-11-02T02:30:00.000Z",
      submissionClose: "2026-11-02T10:30:00.000Z",
      operationScopes: ["checkin"],
      confirmations: ["lumaPolicy", "privacyRetention"],
      retentionNotice: indefiniteRetentionNotice,
      weights: { ...draftPolicy.weights, ai: 0 },
    };
    await db
      .prepare("UPDATE event_settings SET policy=?,active=1")
      .bind(JSON.stringify(custom))
      .all();
    const original = await service("owner").settings();
    const { values, preview } = await save(db, original.version, "submissions");
    const after = await service("owner").settings();
    assert.equal(after.active, 1);
    assert.deepEqual(after.policy.operationScopes, ["checkin"]);
    assert.deepEqual(after.policy.weights, custom.weights);
    assert.equal(after.policy.submissionOpen, custom.submissionOpen);
    assert.equal(after.policy.submissionClose, custom.submissionClose);
    assert.equal(after.policy.diversityAssessment, custom.diversityAssessment);
    assert.equal(after.policy.judgingClose, null);
    assert.equal(after.policy.confirmations.includes("judging"), false);
    const stale = await post(
      db,
      "save-operational-setup",
      operationalSetupSave(values, preview as any),
    );
    assert.equal(stale.status, 409);
    assert.equal(
      (await rows(db, "SELECT * FROM event_policy_history")).length,
      1,
    );
    const before = (await service("owner").settings()).version;
    // A malformed existing submission window cannot be marked confirmed by this control.
    await db
      .prepare(
        "UPDATE event_settings SET policy=json_set(policy,'$.submissionClose',NULL)",
      )
      .all();
    assert.equal(
      (
        await post(
          db,
          "preview-operational-setup",
          request(before, "submissions"),
        )
      ).status,
      422,
    );
    assert.equal((await service("owner").settings()).version, before);
  } finally {
    db.close();
  }
});
test("retained legacy setup component stays unmounted from Settings and preserves its own validation contract", async () => {
  const props = {
    owner: true,
    version: 0,
    open: draftPolicy.submissionOpen,
    close: draftPolicy.submissionClose,
    run: async () => {
      throw new Error("SSR cannot mutate");
    },
  };
  const html = renderToStaticMarkup(
    createElement(OwnerOperationalSetup, props),
  );
  assert.match(html, /indefinitely until authorized manual removal/);
  assert.match(html, /name="/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
  assert.doesNotMatch(html, /<input[^>]*type="checkbox"[^>]*checked=/);
  assert.doesNotMatch(html, /name="reason"/);
  assert.match(html, /privacyConfirmed/);
  assert.equal(
    renderToStaticMarkup(
      createElement(OwnerOperationalSetup, { ...props, owner: false }),
    ),
    "",
  );
  for (const patch of [
    { privacyConfirmed: false },
    { rulesConfirmed: false },
    { version: -1 },
    { operation: "all" },
  ])
    assert.throws(() =>
      operationalSetupRequest({ ...request(0), ...patch } as any),
    );
  const c = portalConfirmationFor(
    "save-operational-setup",
    request(0),
    "Submission operations",
  );
  assert.equal(c.critical, true);
  assert.match(c.description, /does not enable operations/);
  const gate = new ConfirmationGate(() => {}),
    decision = gate.ask(c);
  gate.decide(false);
  assert.equal(await decision, false);
});
