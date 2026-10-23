import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { rows } from "../lib/db";
import { PortalService } from "../lib/service";
import {
  seedTeamControls,
  teamControlActors as actors,
  teamControlIds as ids,
} from "../scripts/team-controls-fixtures";

test("local Team control seed is additive, guarded and exercises existing membership/lock/removal contracts", async () => {
  const { db } = await setup();
  try {
    const before = await rows(db, "SELECT * FROM teams ORDER BY id");
    await assert.rejects(
      seedTeamControls(db, { scope: "wrong" } as never),
      /TEAM_QA_DISPOSABLE_SCOPE_REQUIRED/,
    );
    await seedTeamControls(db, { scope: "fresh-disposable-local" });
    assert.deepEqual(
      await rows(
        db,
        "SELECT * FROM teams WHERE id NOT LIKE 'fake_teamqa_%' ORDER BY id",
      ),
      before,
    );
    const service = (who: keyof typeof actors) =>
      new PortalService(
        db,
        actors[who],
        undefined,
        () => "2026-10-23T10:00:00.000Z",
      );
    const view: any = await service("leader").view("/dashboard");
    assert.equal(view.team.id, ids.formingTeam);
    assert.equal(view.teamStatus, "Forming");
    assert.equal(view.individualStatus, "Registered");
    assert.equal(view.members.length, 2);
    assert.equal(
      view.actions.filter((a: any) => a.status === "pending").length,
      2,
    );
    assert.equal(view.submissionAccess.attemptsUsed, 0);
    assert.equal(view.privateVenue, undefined);
    assert.equal(view.idea.title, "");
    assert.equal(
      ((await service("solo").view("/dashboard")) as any).members.length,
      1,
    );
    await assert.rejects(
      seedTeamControls(db, { scope: "fresh-disposable-local" }),
      /TEAM_QA_RESERVED_ROWS_ALREADY_EXIST/,
    );
    assert.equal(
      (await rows(db, "SELECT id FROM users WHERE id LIKE 'fake_teamqa_%'"))
        .length,
      5,
    );

    // These are in-memory unit checks only. The shared preview is never contacted.
    await assert.rejects(
      service("leader").command("lock-team", { confirmation: "LOCK_TEAM" }),
      /Save the completed team idea/,
    );
    await assert.rejects(
      service("member").command("rename-team", { name: "Disallowed rename" }),
      /LEADER_REQUIRED/,
    );
    await service("leader").command("save-workspace-idea", {
      title: "Synthetic saved idea",
      description: "Synthetic description for the disposable control test.",
    });
    await service("leader").command("rename-team", {
      name: "Synthetic renamed loop",
    });
    await service("leader").command("team-style", {
      avatar: "initials",
      palette: "violet",
    });
    await service("leader").command("respond-team", {
      requestId: ids.acceptRequest,
      accept: true,
    });
    await service("leader").command("respond-team", {
      requestId: ids.declineRequest,
      accept: false,
    });
    assert.equal(
      (
        await rows(
          db,
          "SELECT user_id FROM memberships WHERE team_id=?",
          ids.formingTeam,
        )
      ).length,
      3,
    );
    assert.equal(
      (
        await rows<{ status: string }>(
          db,
          "SELECT status FROM team_actions WHERE id=?",
          ids.declineRequest,
        )
      )[0]?.status,
      "declined",
    );
    await service("leader").command("remove-workspace-member", {
      userId: actors.accept.id,
    });
    await service("leader").command("lock-team", { confirmation: "LOCK_TEAM" });
    await assert.rejects(
      service("leader").command("rename-team", { name: "Frozen rename" }),
      { code: "TEAM_LOCKED" },
    );
    await assert.rejects(
      service("leader").command("remove-workspace-member", {
        userId: actors.member.id,
      }),
      { code: "TEAM_LOCKED" },
    );
    await service("solo").command("delete-own-team", {
      confirmation: "DELETE_OWN_TEAM",
    });
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM memberships WHERE team_id=?",
          ids.soloTeam,
        )
      ).length,
      0,
    );
    assert.equal(
      (await rows(db, "SELECT * FROM teams WHERE id=?", ids.soloTeam)).length,
      1,
    );
    const removal: any = (
      await rows(
        db,
        "SELECT active,snapshot FROM record_removals WHERE kind='team' AND target_id=?",
        ids.soloTeam,
      )
    )[0];
    assert.equal(removal.active, 1);
    assert.equal(JSON.parse(removal.snapshot).leaderId, actors.solo.id);
    assert.equal(
      (
        await rows(
          db,
          "SELECT * FROM submission_versions WHERE team_id IN (?,?)",
          ids.formingTeam,
          ids.soloTeam,
        )
      ).length,
      0,
    );
  } finally {
    db.close();
  }
});
