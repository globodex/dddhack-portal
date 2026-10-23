import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Submission, ProjectVersion } from "../app/portal";
import {
  selectedSubmissionTools,
  submissionToolChoices,
} from "../lib/submission-tools";
import { setup, activate, attend, submission } from "./helpers";
import { one } from "../lib/db";

test("submission has named tool checkboxes and project-specific Cerebras choices, without contribution inputs", () => {
  const html = renderToStaticMarkup(
    createElement(Submission, {
      data: {
        me: {
          id: "fake_alice",
          name: "Alice",
          email: "alice@portal.test",
          role: "participant",
          owner: false,
          canParticipate: true,
        },
        team: { id: "fake_team1", leader_id: "fake_alice" },
        submissionAccess: { canRead: true, canCommit: true },
        project: {
          draft: {
            projectName: "Small Wonder",
            tools: "Codex CLI",
            cerebrasIntegration: "no",
          },
        },
      },
      run: async () => ({}),
    }),
  );
  for (const choice of submissionToolChoices) assert.ok(html.includes(choice));
  assert.match(html, /Does Small Wonder integrate Cerebras/);
  assert.equal((html.match(/name="cerebras-integration"/g) || []).length, 2);
  assert.doesNotMatch(
    html,
    /Tools and how you used them|Everyone.s contribution|Submitted commit SHA/,
  );
  assert.deepEqual(selectedSubmissionTools("Codex CLI\nChatGPT"), [
    "ChatGPT",
    "Codex CLI",
  ]);
  assert.deepEqual(
    selectedSubmissionTools("Legacy narrative remains historical data"),
    [],
  );
  assert.match(
    renderToStaticMarkup(
      createElement(ProjectVersion, {
        payload: { cerebrasIntegration: "yes" },
      }),
    ),
    /Cerebras: Yes/,
  );
});

test("Cerebras yes/no is persisted as declaration only and never invents eligibility or evaluation", async () => {
  for (const answer of ["yes", "no", undefined] as const) {
    const { db, service, clock } = await setup();
    try {
      await activate(db);
      await attend(db, "fake_alice");
      clock("2026-11-01T03:00:00.000Z");
      const project: any = Object.fromEntries(
        [
          "projectName",
          "problemSolution",
          "description",
          "github",
          "demo",
          "logo",
          "banner",
          "tools",
          "attestation",
        ].map((k) => [k, (submission as any)[k]]),
      );
      if (answer) project.cerebrasIntegration = answer;
      await service().command("submit-project", { revision: 0, project });
      const version: any = await one(
        db,
        "SELECT payload FROM submission_versions WHERE team_id='fake_team1'",
      );
      assert.equal(JSON.parse(version.payload).cerebrasIntegration, answer);
      assert.deepEqual(JSON.parse(version.payload).contributions, []);
    } finally {
      db.close();
    }
  }
});
