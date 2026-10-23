"use client";
import { Crown } from "lucide-react";
import { useAdminOperation, type AdminRun } from "./admin-participant-actions";

export type AdminLeaderTransferTeam = {
  id: string;
  name: string;
  leader_id: string;
};
export type AdminLeaderTransferMember = {
  id: string;
  name: string;
  removed?: boolean;
};

/** Mount beside a current teammate; run owns the named confirmation and reload. */
export default function AdminLeaderTransfer({
  team,
  member,
  canTransfer,
  run,
}: {
  team: AdminLeaderTransferTeam;
  member: AdminLeaderTransferMember;
  canTransfer: boolean;
  run: AdminRun;
}) {
  const { busy, error, execute } = useAdminOperation();
  if (!canTransfer || member.removed || member.id === team.leader_id)
    return null;
  return (
    <div className="admin-control admin-leader-transfer">
      <button
        type="button"
        className="button secondary admin-icon-action"
        disabled={busy}
        aria-busy={busy}
        aria-label={`Make ${member.name} team leader for ${team.name}`}
        title={`Make ${member.name} team leader`}
        onClick={() =>
          void execute(() =>
            run("transfer-team-leader", {
              teamId: team.id,
              userId: member.id,
              expectedLeaderId: team.leader_id,
              confirmation: "TRANSFER_TEAM_LEADER",
            }),
          )
        }
      >
        <Crown
          className="admin-control-icon"
          size={20}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
