import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup,
  activate,
  attend,
  submission,
  rehearsalPolicy,
} from "./helpers";
import { batch } from "../lib/db";

for (const modern of [false, true]) {
  test(`${modern ? "project" : "legacy"} results require the configured number of independent human reviewers`, async () => {
    const { db, service, clock } = await setup();
    try {
      await activate(db);
      await batch(db, [
        [
          "UPDATE event_settings SET policy=?,active=0 WHERE id=1",
          JSON.stringify({ ...rehearsalPolicy, minJudges: 2 }),
        ],
      ]);
      await attend(db, "fake_alice");
      clock("2026-11-01T06:00:00.000Z");
      const submitted = await service().command(
        modern ? "submit-project" : "submit",
        modern
          ? {
              revision: 0,
              project: Object.fromEntries(
                [
                  "projectName",
                  "problemSolution",
                  "description",
                  "github",
                  "commitSha",
                  "demo",
                  "logo",
                  "banner",
                  "tools",
                  "contributions",
                  "attestation",
                ].map((key) => [
                  key,
                  submission[key as keyof typeof submission],
                ]),
              ),
            }
          : submission,
      );
      const view = modern
        ? ((await service().view("/submission")) as any)
        : null;
      const versionId = modern ? view.attempts[0].id : submitted.id;
      const projectId = view?.project.id;
      clock("2026-11-01T11:00:00.000Z");
      await service("admin").command("review", {
        teamId: "fake_team1",
        versionId,
        eligibility: "eligible",
        astra: 20,
        codex: 3,
        diversity: 7,
        falseClaims: 0,
        evidence: "Synthetic manually verified evidence",
        reason: "Synthetic rubric review",
      });
      for (const [index, judge] of ["judge", "judge2"].entries()) {
        await service("owner").command(
          modern ? "assign-project" : "assign-judge",
          modern
            ? {
                projectId,
                userId: "fake_" + judge,
                kind: "judge",
                reason: "Synthetic independent reviewer",
              }
            : {
                teamId: "fake_team1",
                judgeId: "fake_" + judge,
                reason: "Synthetic independent reviewer",
              },
        );
        const review = () =>
          service(judge).command(
            modern ? "review-project" : "judge-score",
            modern
              ? {
                  projectId,
                  versionId,
                  rating: 8,
                  body: "Synthetic private review",
                }
              : {
                  teamId: "fake_team1",
                  rating: 8,
                  notes: "Synthetic private review",
                },
          );
        await review();
        if (index === 0) {
          // A replacement review by one person cannot satisfy a second reviewer.
          await review();
          await assert.rejects(
            service("owner").command("compute-results", {}),
            { code: "SCORE_COVERAGE_INCOMPLETE" },
          );
          clock("2026-11-01T13:00:00.000Z");
          await assert.rejects(
            service("owner").command("freeze-results", {
              reason: "Synthetic coverage check",
            }),
            { code: "SCORE_COVERAGE_INCOMPLETE" },
          );
          clock("2026-11-01T11:00:00.000Z");
        }
      }
      const result = (await service("owner").command(
        "compute-results",
        {},
      )) as any;
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].eligibility, "eligible");
    } finally {
      db.close();
    }
  });
}
