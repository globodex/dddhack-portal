import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AddAdmins, { addAdminValues } from "../app/add-admins";
import AdminImportControls, {
  addParticipants,
  confirmedImportValues,
  type ImportPreview,
  type ParticipantImportMode,
} from "../app/admin-import-controls";
import AdminParticipantActions, {
  participantActionValues,
  AdminParticipantFilters,
} from "../app/admin-participant-actions";
import AdminProjectActions, {
  projectActionValues,
} from "../app/admin-project-actions";
import { ActionCancelled } from "../lib/action-confirmation";

const noRun = async () => {
  throw new Error("Rendering must not run an action.");
};
const review = (emails = ["one@example.test"]): ImportPreview => ({
  digest: "server-digest",
  headers: ["email"],
  fieldMap: { email: "email" },
  counts: {
    new: emails.length,
    existing: 0,
    invalid: 0,
    duplicates: 0,
    prefills: 0,
  },
  rows: emails.map((email, index) => ({
    row: index + 1,
    email,
    existing: false,
    action: "Add Registered participant",
  })),
  errors: [],
});

test("single email, list and email-only CSV require no profile fields", async () => {
  for (const [mode, csv, emails] of [
    ["single", "one@example.test", ["one@example.test"]],
    [
      "emails",
      "one@example.test;two@example.test",
      ["one@example.test", "two@example.test"],
    ],
    [
      "csv",
      "email\none@example.test\ntwo@example.test",
      ["one@example.test", "two@example.test"],
    ],
  ] as [ParticipantImportMode, string, string[]][]) {
    const sent: { action: string; values: Record<string, unknown> }[] = [];
    await addParticipants(
      csv,
      {},
      mode,
      async (request) => {
        assert.equal(request.csv, csv);
        return review(emails);
      },
      async (action, values) => {
        sent.push({ action, values });
        return {};
      },
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].action, "commit-import");
    assert.equal(sent[0].values.newCount, emails.length);
    assert.equal(
      sent[0].values.singleEmail,
      mode === "single" ? emails[0] : undefined,
    );
    for (const field of [
      "displayName",
      "bio",
      "phone",
      "sex",
      "bestDescription",
      "organization",
    ])
      assert.equal(field in sent[0].values, false);
    const html = renderToStaticMarkup(
      createElement(AdminImportControls, { run: noRun, initialMode: mode }),
    );
    assert.ok(html.includes(">Add</button>"));
    assert.ok(!html.includes("Preview import"));
    assert.ok(!html.includes("Import preview"));
    assert.ok(!html.includes('type="tel"'));
    assert.ok(!html.includes("Complete profile"));
    assert.equal((html.match(/<p/g) || []).length, 0);
  }
});

test("Add waits for validated server count before requesting confirmation-aware commit", async () => {
  let resolvePreview!: (value: ImportPreview) => void;
  const pending = new Promise<ImportPreview>((resolve) => {
    resolvePreview = resolve;
  });
  let committed = false;
  const operation = addParticipants(
    "one@example.test",
    {},
    "single",
    async () => pending,
    async () => {
      committed = true;
      return {};
    },
  );
  assert.equal(committed, false);
  resolvePreview(review());
  await operation;
  assert.equal(committed, true);
  const mixed = review(["one@example.test", "existing@example.test"]);
  mixed.rows[1].existing = true;
  mixed.counts = { ...mixed.counts, new: 1, existing: 1, duplicates: 2 };
  assert.equal(
    confirmedImportValues("source", {}, "emails", mixed).newCount,
    1,
  );
});

test("invalid, existing-only and inconsistent imports never ask for commit", async () => {
  const invalid = review();
  invalid.errors = ["Row 2: enter a valid email."];
  invalid.counts.invalid = 1;
  const existing = review();
  existing.rows[0].existing = true;
  existing.counts.new = 0;
  existing.counts.existing = 1;
  const mismatch = review();
  mismatch.counts.new = 2;
  for (const result of [invalid, existing, mismatch]) {
    let calls = 0;
    await assert.rejects(
      addParticipants(
        "source",
        {},
        "emails",
        async () => result,
        async () => {
          calls++;
          return {};
        },
      ),
    );
    assert.equal(calls, 0);
  }
  await assert.rejects(
    addParticipants(
      "one@example.test",
      {},
      "single",
      async () => review(),
      async () => {
        throw new ActionCancelled();
      },
    ),
    ActionCancelled,
  );
});

test("full CSV imports only explicitly mapped present fields", () => {
  const csv = "Actual email,Actual name\none@example.test,Person One";
  const result = review();
  result.headers = ["Actual email", "Actual name"];
  result.fieldMap = { email: "Actual email", displayName: "Actual name" };
  result.counts.prefills = 1;
  const values = confirmedImportValues(csv, result.fieldMap, "csv", result);
  assert.deepEqual(values.fieldMap, {
    email: "Actual email",
    displayName: "Actual name",
  });
  assert.equal("phone" in values.fieldMap!, false);
  assert.equal(values.csv, csv);
});

test("compact target actions keep exact tokens with no mandatory reason", () => {
  assert.deepEqual(
    participantActionValues({ id: "person-1", name: "Person One" }),
    { userId: "person-1", confirmation: "REMOVE_PARTICIPANT" },
  );
  assert.deepEqual(
    projectActionValues("project-1", "submission", "version-2", "", false),
    {
      projectId: "project-1",
      scope: "submission",
      versionId: "version-2",
      confirmation: "REMOVE_SUBMISSION",
    },
  );
  for (const component of [
    createElement(AdminParticipantActions, {
      participant: { id: "person-1", name: "Person One" },
      run: noRun,
    }),
    createElement(AdminProjectActions, {
      project: { id: "project-1", name: "Project One" },
      versions: [],
      run: noRun,
    }),
    createElement(AdminParticipantFilters, { onChange: () => {} }),
  ]) {
    const html = renderToStaticMarkup(component);
    assert.ok(!html.includes("Audit reason"));
    assert.equal((html.match(/<p/g) || []).length, 0);
  }
});

test("Add Admins is owner-only and requests an exact single email without role choice", () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(AddAdmins, { owner: false, run: noRun }),
    ),
    "",
  );
  const html = renderToStaticMarkup(
    createElement(AddAdmins, { owner: true, run: noRun }),
  );
  assert.ok(html.includes("Add Admins"));
  assert.ok(html.includes('type="email"'));
  assert.ok(!html.includes("<select"));
  assert.ok(!html.includes("reason"));
  assert.deepEqual(addAdminValues(" Owner.Helper@Example.test "), {
    email: "owner.helper@example.test",
    confirmation: "ADD_ADMIN",
  });
  for (const bad of [
    "",
    "first@example.test,second@example.test",
    "plain",
    "first@example.test second@example.test",
  ])
    assert.throws(() => addAdminValues(bad));
});
