import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminPreviewError,
  previewAdminAction,
} from "../app/admin-import-controls";

test("malformed imports give actionable errors while preserving refusal", async () => {
  const before = globalThis.fetch;
  try {
    for (const [code, message] of [
      ["CSV_EMPTY", "Enter valid emails or a CSV with a header row."],
      ["INVALID_CSV_QUOTE", "Check CSV quotes and try again."],
      ["CSV_COLUMN_MISMATCH", "Each CSV row must match the header columns."],
    ] as const) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ code, message: code }), {
          status: 422,
          headers: { "content-type": "application/json" },
        });
      await assert.rejects(
        previewAdminAction("preview-import", {
          kind: "roster",
          csv: "malformed",
        }),
        (error) => error instanceof Error && error.message === message,
      );
    }
  } finally {
    globalThis.fetch = before;
  }
});
test("import copy preserves access errors and other preview actions", () => {
  assert.equal(
    adminPreviewError("preview-import", {
      code: "FORBIDDEN",
      message: "Admin access required.",
    }),
    "Admin access required.",
  );
  assert.equal(
    adminPreviewError("preview-submission-window", {
      code: "INVALID_WINDOW",
      message: "Opening must be before closing.",
    }),
    "Opening must be before closing.",
  );
});
