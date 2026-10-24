import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publishSubmissionWindow,
  submissionWindowValues,
} from "../app/owner-submission-window";
import { ActionCancelled } from "../lib/action-confirmation";
const open = "2026-10-24T10:00",
  close = "2026-10-24T18:00";
const values = submissionWindowValues(open, close);
const response = {
  ...values,
  token: "synthetic-token",
  version: 7,
  openIST: "24 October10:00 IST",
  closeIST: "24 October18:00 IST",
  warnings: [
    "Synthetic fixed-cutoff warning",
    "Synthetic judging-close warning",
  ],
};
test("first Publish reaches confirmation with both dates and warnings in one action", async () => {
  const calls: string[] = [];
  await publishSubmissionWindow(
    open,
    close,
    async (request) => {
      calls.push("preflight");
      assert.deepEqual(request, values);
      return response;
    },
    async (action, payload) => {
      calls.push("confirm/persist");
      assert.equal(action, "publish-submission-window");
      assert.equal(payload.open, values.open);
      assert.equal(payload.close, values.close);
      assert.equal(payload.token, response.token);
      assert.equal(payload.version, 7);
      assert.deepEqual(payload.windowWarnings, response.warnings);
      assert.equal(payload.confirmation, "CHANGE_SUBMISSION_WINDOW");
      return {};
    },
  );
  assert.deepEqual(calls, ["preflight", "confirm/persist"]);
});
test("cancelled publication leaves no reusable review step; retry obtains fresh guards", async () => {
  let previews = 0;
  const preview = async () => ({
    ...response,
    token: "synthetic-token-" + ++previews,
  });
  await assert.rejects(
    publishSubmissionWindow(open, close, preview, async () => {
      throw new ActionCancelled();
    }),
    ActionCancelled,
  );
  await publishSubmissionWindow(open, close, preview, async (_, payload) => {
    assert.equal(payload.token, "synthetic-token-2");
    return {};
  });
  assert.equal(previews, 2);
});
test("mismatched preview dates never reach publication", async () => {
  let published = false;
  await assert.rejects(
    publishSubmissionWindow(
      open,
      close,
      async () => ({ ...response, close: "2026-10-25T00:00:00.000Z" }),
      async () => {
        published = true;
        return {};
      },
    ),
    /differs from the requested dates/,
  );
  assert.equal(published, false);
});
