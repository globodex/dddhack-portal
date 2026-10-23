import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AdminParticipantActions, {
  defaultAdminParticipantFilters,
  filterAdminParticipants,
  participantActionValues,
} from "../app/admin-participant-actions";
import AdminImportControls, {
  approvedImportFields,
  canCommitImport,
  importRequest,
  type ImportPreview,
} from "../app/admin-import-controls";
import AdminProjectActions, {
  projectActionValues,
} from "../app/admin-project-actions";
import OwnerSubmissionWindow, {
  istInputToUTC,
  utcToISTInput,
  submissionWindowValues,
  submissionWindowPublishValues,
  type SubmissionWindowPreview,
} from "../app/owner-submission-window";

const noMutation = async () => {
  throw new Error("Rendering must never mutate");
};

test("IST values are exact UTC independently of the machine timezone", () => {
  const before = process.env.TZ;
  try {
    for (const timezone of [
      "UTC",
      "America/New_York",
      "Pacific/Kiritimati",
      "Asia/Kolkata",
    ]) {
      process.env.TZ = timezone;
      assert.equal(
        istInputToUTC("2026-11-01T08:00"),
        "2026-11-01T02:30:00.000Z",
      );
      assert.equal(
        istInputToUTC("2026-11-01T16:00"),
        "2026-11-01T10:30:00.000Z",
      );
      assert.equal(
        istInputToUTC("2026-01-01T00:15"),
        "2025-12-31T18:45:00.000Z",
      );
      assert.equal(
        utcToISTInput("2026-11-01T02:30:00.000Z"),
        "2026-11-01T08:00",
      );
      assert.equal(
        utcToISTInput("2026-11-01T08:00:00+05:30"),
        "2026-11-01T08:00",
      );
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test("window validation rejects rolled calendars, guessed zones and non-increasing intervals", () => {
  for (const input of [
    "2026-02-29T08:00",
    "2026-04-31T08:00",
    "2026-13-01T08:00",
    "2026-11-01T24:00",
    "2026-11-01T08:60",
    "2026-11-01",
    "2026-11-01T08:00Z",
    "",
    "0000-01-01T08:00",
  ])
    assert.throws(() => istInputToUTC(input), Error, input);
  assert.equal(istInputToUTC("2028-02-29T08:00"), "2028-02-29T02:30:00.000Z");
  assert.throws(() => utcToISTInput("2026-11-01T08:00"));
  assert.throws(() => utcToISTInput("2026-02-30T08:00Z"));
  for (const close of ["2026-11-01T08:00", "2026-11-01T07:59"])
    assert.throws(() => submissionWindowValues("2026-11-01T08:00", close));
});

test("window publication preserves reviewed server token and version and requires audit reason", () => {
  const dates = submissionWindowValues("2026-11-01T08:00", "2026-11-01T16:00");
  const review: SubmissionWindowPreview = {
    ...dates,
    token: "preview-token",
    version: 4,
    openIST: "1 Nov 2026 08:00 IST",
    closeIST: "1 Nov 2026 16:00 IST",
    warnings: [],
  };
  assert.deepEqual(submissionWindowPublishValues(review, " reviewed dates "), {
    ...dates,
    token: "preview-token",
    version: 4,
    reason: "reviewed dates",
    confirmation: "CHANGE_SUBMISSION_WINDOW",
  });
  assert.throws(() => submissionWindowPublishValues(review, " "));
  assert.throws(() =>
    submissionWindowPublishValues({ ...review, token: "" }, "reason"),
  );
  assert.throws(() =>
    submissionWindowPublishValues({ ...review, version: NaN }, "reason"),
  );
  assert.throws(() =>
    submissionWindowPublishValues({ ...review, close: review.open }, "reason"),
  );
});

test("participant filters default to Registered in Locked teams, combine and order earliest known lock", () => {
  const items = [
    {
      id: "later",
      name: "Later",
      status: "Registered",
      teamId: "t2",
      teamName: "Alpha",
      teamLocked: true,
      teamStatus: "Locked",
      teamLockedAt: "2026-10-24T10:00Z",
    },
    {
      id: "unknown",
      name: "Unknown",
      status: "Registered",
      teamId: "t3",
      teamName: "Gamma",
      teamLocked: true,
      teamStatus: "Locked",
    },
    {
      id: "first",
      name: "First",
      email: "first@example.test",
      status: "Registered",
      teamId: "t1",
      teamName: "Alpha",
      teamLocked: true,
      teamStatus: "Locked",
      teamLockedAt: "2026-10-23T10:00Z",
    },
    {
      id: "going",
      name: "Going",
      status: "Going",
      teamId: "t1",
      teamName: "Alpha",
      teamLocked: true,
      teamStatus: "Locked",
      teamLockedAt: "2026-10-23T10:00Z",
    },
    {
      id: "submitted",
      name: "Submitted",
      status: "Registered",
      teamId: "t4",
      teamName: "Delta",
      teamLocked: true,
      teamStatus: "Submitted",
    },
    { id: "solo", name: "Solo", status: "Registered" },
  ];
  assert.deepEqual(
    filterAdminParticipants(items).map((item) => item.id),
    ["first", "later", "unknown"],
  );
  assert.deepEqual(
    filterAdminParticipants(items, {
      ...defaultAdminParticipantFilters,
      individual: "FIRST@EXAMPLE",
      teamQuery: "alpha",
    }).map((item) => item.id),
    ["first"],
  );
  assert.deepEqual(
    filterAdminParticipants(items, {
      ...defaultAdminParticipantFilters,
      status: "going",
      teamQuery: "Alpha",
    }).map((item) => item.id),
    ["going"],
  );
  assert.deepEqual(
    filterAdminParticipants(items, {
      ...defaultAdminParticipantFilters,
      team: "none",
    }).map((item) => item.id),
    ["solo"],
  );
  assert.deepEqual(
    filterAdminParticipants(items, {
      ...defaultAdminParticipantFilters,
      team: "submitted",
    }).map((item) => item.id),
    ["submitted"],
  );
  assert.equal(items[0].id, "later", "does not reorder the supplied records");
});

test("single-person and exact-project payloads have no bulk removal or reset path", () => {
  assert.deepEqual(
    participantActionValues({ id: "person-1", name: "Person" }, " correction "),
    {
      userId: "person-1",
      reason: "correction",
      confirmation: "REMOVE_PARTICIPANT",
    },
  );
  assert.equal(
    participantActionValues(
      { id: "person-1", name: "Person", removed: true },
      "restore",
    ).confirmation,
    "RESTORE_PARTICIPANT",
  );
  assert.throws(() =>
    participantActionValues({ id: "person-1", name: "Person" }, ""),
  );
  for (const restore of [false, true]) {
    for (const scope of ["project", "submission", "both"] as const) {
      const payload = projectActionValues(
        "project-1",
        scope,
        "version-2",
        "audit",
        restore,
      );
      assert.equal(
        payload.confirmation,
        `${restore ? "RESTORE" : "REMOVE"}_${scope.toUpperCase()}`,
      );
      assert.equal("versionId" in payload, scope !== "project");
      assert.equal("resetAttempts" in payload, false);
      if (scope !== "project")
        assert.throws(() =>
          projectActionValues("project-1", scope, "", "audit", restore),
        );
    }
  }
});

test("import preserves supplied CSV and explicit approved mapping without inventing headers", () => {
  const csv =
    'Email supplied by user,Name supplied by user,Ignored\nnew@example.test,"Person, One",unused';
  const fieldMap = {
    email: "Email supplied by user",
    displayName: "Name supplied by user",
  };
  assert.deepEqual(importRequest(csv, fieldMap), {
    kind: "roster",
    csv,
    fieldMap,
  });
  assert.deepEqual(importRequest("a@example.test;b@example.test", {}), {
    kind: "roster",
    csv: "a@example.test;b@example.test",
  });
  assert.throws(() => importRequest(" ", {}));
  assert.throws(() =>
    importRequest(csv, { email: "Same", displayName: "Same" }),
  );
  assert.deepEqual(approvedImportFields, [
    "email",
    "displayName",
    "bio",
    "phone",
    "sex",
    "bestDescription",
    "organization",
    "openaiOrgId",
    "linkedin",
    "github",
    "x",
    "instagram",
    "website",
  ]);
  const preview: ImportPreview = {
    digest: "digest",
    headers: [],
    fieldMap: {},
    counts: { new: 1, existing: 1, invalid: 0, duplicates: 0, prefills: 0 },
    rows: [],
  };
  assert.equal(canCommitImport(preview), true);
  assert.equal(canCommitImport(null), false);
  assert.equal(canCommitImport({ ...preview, digest: "" }), false);
  assert.equal(
    canCommitImport({ ...preview, counts: { ...preview.counts, invalid: 1 } }),
    false,
  );
  assert.equal(
    canCommitImport({ ...preview, errors: ["Resolve invalid row"] }),
    false,
  );
});

test("controls render target, audit and real-attempt consequences without mutating or exposing owner settings", () => {
  const participant = renderToStaticMarkup(
    createElement(AdminParticipantActions, {
      participant: {
        id: "person-1",
        name: "Person <One>",
        email: "one@example.test",
      },
      run: noMutation,
    }),
  );
  assert.ok(participant.includes("Person &lt;One&gt;"));
  assert.ok(
    participant.includes("sessions, private team access and credits access"),
  );
  assert.ok(participant.includes("Audit reason"));
  assert.ok(!participant.includes("bulk"));
  const project = renderToStaticMarkup(
    createElement(AdminProjectActions, {
      project: { id: "project-1", name: "Exact Project" },
      versions: [{ id: "version-2", label: "Attempt 2" }],
      run: noMutation,
    }),
  );
  assert.ok(project.includes("Exact Project"));
  assert.ok(project.includes("One submission only"));
  assert.ok(project.includes("never reset the hard limit of three"));
  const props = {
    open: "2026-11-01T02:30:00Z",
    close: "2026-11-01T10:30:00Z",
    run: noMutation,
  };
  assert.equal(
    renderToStaticMarkup(
      createElement(OwnerSubmissionWindow, { ...props, owner: false }),
    ),
    "",
  );
  const owner = renderToStaticMarkup(
    createElement(OwnerSubmissionWindow, { ...props, owner: true }),
  );
  assert.ok(owner.includes('value="2026-11-01T08:00"'));
  assert.ok(owner.includes('value="2026-11-01T16:00"'));
  assert.ok(
    owner.includes(
      "repository creation and first commit must both be strictly after",
    ),
  );
  assert.ok(owner.includes("Testing uses real attempts"));
  const imports = renderToStaticMarkup(
    createElement(AdminImportControls, { run: noMutation }),
  );
  assert.ok(imports.includes("Removed accounts stay removed"));
  assert.ok(imports.includes("All social links are optional"));
  assert.ok(
    !imports.includes("Review add-only import"),
    "commit is absent before preview",
  );
});
