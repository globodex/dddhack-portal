"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleCheck,
  LockKeyhole,
  RefreshCw,
  X,
} from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";
import { readPortalView } from "../lib/portal-read";
import { portalErrorText } from "../lib/ui-feedback";
import { GenderSymbol, genderLabel } from "./gender-presentation";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";
import { useHydrated } from "./use-hydrated";
import type { AdminTeamRun } from "./admin-team-actions";

type ApprovalMember = {
  id: string;
  name: string;
  email: string;
  githubUrl: string | null;
  linkedinUrl: string | null;
  profession: string | null;
  gender: string | null;
  genderLabel: string | null;
  status: string;
  approval: string;
  willBecomeGoing: boolean;
  approvalIssue: string | null;
};
export type TeamApprovalPreview = {
  team: { id: string; name: string; locked: boolean };
  idea: { title: string; description: string } | null;
  members: ApprovalMember[];
  snapshotDigest: string;
  canApprove: boolean;
  blockedReason: string | null;
};
export type ApprovalTeam = {
  id: string;
  name: string;
  locked?: boolean;
  members?: Array<{ approval?: string; status?: string }>;
};

/** Attendance follows Going; an approved Absent member retains approval. */
export function teamIsApproved(team: Pick<ApprovalTeam, "locked" | "members">) {
  return (
    team.locked === true &&
    Array.isArray(team.members) &&
    team.members.length > 0 &&
    team.members.every((member) => member.approval === "approved")
  );
}
export function teamNeedsApproval(team: ApprovalTeam) {
  return Boolean(team.id && team.locked === true && !teamIsApproved(team));
}
export function hasTeamApprovalConfirmation(
  action: string,
  values: Record<string, any>,
) {
  return (
    action === "approve-team" &&
    values.confirmation === "APPROVE_TEAM" &&
    typeof values.teamId === "string" &&
    values.teamId.length > 0 &&
    typeof values.snapshotDigest === "string" &&
    /^[a-f0-9]{64}$/.test(values.snapshotDigest)
  );
}

export function approvalSocialUrl(
  value: unknown,
  platform: "github" | "linkedin",
) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed =
      platform === "github"
        ? ["github.com", "www.github.com"].includes(host)
        : host === "linkedin.com" || host.endsWith(".linkedin.com");
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      allowed
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function parseTeamApprovalPreview(
  body: Record<string, any>,
  teamId: string,
): TeamApprovalPreview {
  if (
    !body ||
    body.team?.id !== teamId ||
    typeof body.team?.name !== "string" ||
    typeof body.team?.locked !== "boolean" ||
    !Array.isArray(body.members) ||
    body.members.length > 5 ||
    typeof body.canApprove !== "boolean" ||
    typeof body.snapshotDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.snapshotDigest) ||
    body.members.some(
      (member: any) =>
        !member ||
        typeof member.id !== "string" ||
        typeof member.name !== "string" ||
        typeof member.email !== "string" ||
        !["Registered", "Going", "Checked in", "Absent"].includes(
          member.status,
        ) ||
        typeof member.approval !== "string" ||
        typeof member.willBecomeGoing !== "boolean" ||
        (member.willBecomeGoing && member.status !== "Registered"),
    )
  ) {
    throw new Error(
      "Team approval details are unavailable. Reload and try again.",
    );
  }
  return body as TeamApprovalPreview;
}

/** Safe, explicit fields only. Private preview data never appears in the list trigger. */
export function TeamApprovalDetails({
  preview,
}: {
  preview: TeamApprovalPreview;
}) {
  return (
    <>
      <section className="team-approval-idea" aria-label="Private team idea">
        <h3>
          <LockKeyhole size={16} aria-hidden="true" />
          Private idea
        </h3>
        <h4>{preview.idea?.title || "Idea unavailable"}</h4>
        <p>{preview.idea?.description || "Description unavailable."}</p>
      </section>
      <section
        className="team-approval-members"
        aria-label="Members and status changes"
      >
        <h3>Members</h3>
        {preview.members.length === 0 ? (
          <p>No current members.</p>
        ) : (
          <ul>
            {preview.members.map((member) => {
              const github = approvalSocialUrl(member.githubUrl, "github");
              const linkedin = approvalSocialUrl(
                member.linkedinUrl,
                "linkedin",
              );
              const sex =
                member.genderLabel ||
                genderLabel(member.gender) ||
                "Sex unavailable";
              return (
                <li key={member.id}>
                  <div className="team-approval-member-heading">
                    <div>
                      <strong>{member.name || "Member"}</strong>
                      <span>{member.email || "Email unavailable"}</span>
                    </div>
                    <div
                      className="team-approval-status-change"
                      aria-label={`${member.name || "Member"}: ${member.status}${member.willBecomeGoing && member.status === "Registered" ? " to Going" : ", unchanged"}`}
                    >
                      <span>{member.status || "Status unavailable"}</span>
                      {member.willBecomeGoing &&
                      member.status === "Registered" ? (
                        <>
                          <ArrowRight size={16} aria-hidden="true" />
                          <strong>Going</strong>
                        </>
                      ) : (
                        <small>Unchanged</small>
                      )}
                    </div>
                  </div>
                  <div className="team-approval-member-chips">
                    <span>
                      <BriefcaseBusiness size={15} aria-hidden="true" />
                      {member.profession || "Profession unavailable"}
                    </span>
                    <span>
                      <GenderSymbol value={member.gender} size={16} />
                      {sex}
                    </span>
                  </div>
                  <div className="team-approval-socials">
                    {github ? (
                      <a
                        href={github}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src="/icons/social/github.svg"
                          width="17"
                          height="17"
                          alt=""
                        />
                        GitHub
                        <span className="sr-only"> for {member.name}</span>
                      </a>
                    ) : (
                      <span>GitHub unavailable</span>
                    )}
                    {linkedin ? (
                      <a
                        href={linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src="/icons/social/linkedin.svg"
                          width="17"
                          height="17"
                          alt=""
                        />
                        LinkedIn
                        <span className="sr-only"> for {member.name}</span>
                      </a>
                    ) : (
                      <span>LinkedIn unavailable</span>
                    )}
                  </div>
                  {member.approvalIssue && (
                    <p className="team-approval-member-issue">
                      {member.approvalIssue}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function ApprovalDialog({
  team,
  run,
  opener,
  close,
}: {
  team: ApprovalTeam;
  run: AdminTeamRun;
  opener: HTMLButtonElement | null;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    body = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    closeRef = useRef(close),
    busyRef = useRef(false),
    id = useId(),
    pending = useRef(false);
  closeRef.current = close;
  const [preview, setPreview] = useState<TeamApprovalPreview | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  busyRef.current = busy;
  useEffect(() => {
    if (error && body.current) body.current.scrollTop = 0;
  }, [error]);
  useEffect(() => {
    const popup = dialog.current;
    if (!popup) return;
    const root = document.documentElement,
      body = document.body;
    const old = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      gutter: root.style.scrollbarGutter,
    };
    if (window.innerWidth > root.clientWidth)
      root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const fallback =
      opener
        ?.closest(".admin-team-card")
        ?.querySelector<HTMLButtonElement>(".admin-team-card-toggle") ||
      document.querySelector<HTMLInputElement>(".admin-list-toolbar input");
    popup.showModal();
    closeButton.current?.focus();
    let release = () => {};
    const armHistory = () => {
      release = trackDialogHistory(() => {
        if (busyRef.current) {
          release();
          armHistory();
        } else closeRef.current();
      }, opener);
    };
    armHistory();
    return () => {
      release();
      popup.close();
      root.style.overflow = old.rootOverflow;
      body.style.overflow = old.bodyOverflow;
      root.style.scrollbarGutter = old.gutter;
      const target = [
        opener,
        fallback,
        document.querySelector<HTMLInputElement>(".admin-list-toolbar input"),
      ].find((node) => node?.isConnected && !node.matches(":disabled"));
      target?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setPreview(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          view: "/admin/team-approval",
          focus: team.id,
        });
        const { response, body } = await readPortalView(
          `/api/portal?${params}`,
          controller.signal,
        );
        if (!response.ok) throw new Error(portalErrorText(body));
        const next = parseTeamApprovalPreview(body, team.id);
        if (!controller.signal.aborted) setPreview(next);
      } catch (cause) {
        if (!controller.signal.aborted) setLoadError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [team.id, version]);
  const approve = async () => {
    if (!preview?.canApprove || loading || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await run(
        "approve-team",
        {
          teamId: preview.team.id,
          snapshotDigest: preview.snapshotDigest,
          confirmation: "APPROVE_TEAM",
        },
        { errorFeedback: "local" },
      );
      closeRef.current();
    } catch (cause) {
      if (!(cause instanceof ActionCancelled)) {
        setError((cause as Error).message);
        const failure = cause as Error & { status?: number; code?: string };
        if (failure.status === 409 && failure.code === "TEAM_APPROVAL_CHANGED")
          setVersion((value) => value + 1);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="admin-team-approval-dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        event.stopPropagation();
        trapDialogFocus(event);
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }}
    >
      <header>
        <div>
          <h2 id={`${id}-title`}>Approve team</h2>
          <p>{preview?.team.name || team.name}</p>
        </div>
        <button
          ref={closeButton}
          type="button"
          aria-label="Close team approval"
          disabled={busy}
          onClick={close}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <div
        ref={body}
        className="team-approval-dialog-body"
        aria-busy={loading || busy}
      >
        {error && (
          <p className="team-approval-error" role="alert">
            {error}
          </p>
        )}
        {preview &&
          !preview.canApprove &&
          preview.blockedReason &&
          preview.blockedReason !== error && (
            <p className="team-approval-blocked" role="status">
              {preview.blockedReason}
            </p>
          )}
        {loading ? (
          <div className="team-approval-loading" role="status">
            <span>Loading team details…</span>
            <i />
            <i />
            <i />
          </div>
        ) : loadError ? (
          <div className="team-approval-load-error">
            <p role="alert">{loadError}</p>
            <button
              className="button secondary"
              type="button"
              onClick={() => setVersion((value) => value + 1)}
            >
              <RefreshCw size={17} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : preview ? (
          <TeamApprovalDetails preview={preview} />
        ) : null}
      </div>
      <footer>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={close}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button team-approval-confirm"
          disabled={loading || busy || !preview?.canApprove || !!loadError}
          aria-busy={busy}
          onClick={() => void approve()}
        >
          {busy ? "Approving…" : "Approve team"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}

export default function AdminTeamApproval({
  team,
  run,
}: {
  team: ApprovalTeam;
  run: AdminTeamRun;
}) {
  const hydrated = useHydrated(),
    opener = useRef<HTMLButtonElement | null>(null),
    [open, setOpen] = useState(false);
  if (!teamNeedsApproval(team)) return null;
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="admin-team-approve-button"
        disabled={!hydrated}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <CircleCheck size={18} aria-hidden="true" />
        <span>Approve team</span>
      </button>
      {open && (
        <ApprovalDialog
          team={team}
          run={run}
          opener={opener.current}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
