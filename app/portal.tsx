"use client";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search as SearchIcon,
  Save as SaveIcon,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  ExternalLink,
  EyeOff,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Send,
  Upload,
  Link2,
  Phone,
  Trash2,
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  ClipboardList,
  Compass,
  Copy,
  Eye,
  FileText,
  History,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  SlidersHorizontal,
  UserRound,
  Users,
  UsersRound,
  X,
  Ticket,
} from "lucide-react";
import AddAdmins from "./add-admins";
import AdminCreditBatches from "./admin-credit-batches";
import AdminLeaderTransfer from "./admin-leader-transfer";
import Link from "next/link";
import { useDiscoverPeople, peopleDirectoryUrl, readPeoplePage } from "./use-discover-people";
import { HeadingDot } from "./expressive-heading";
import RouteSkeleton from "./route-skeleton";
import MobileNavigation from "./mobile-navigation";
import { useHydrated } from "./use-hydrated";
import { readPortalView } from "../lib/portal-read";
import {AdminPresentationCache, AdminPresentationCacheMiss} from "../lib/admin-presentation";
import DiscoveryProfile, {
  discoverySocialLinks,
  openDiscoveryDialog,
  type DiscoveryPerson,
} from "./discovery-profile";
import { portalNavigation } from "../lib/navigation";
import {
  submissionToolChoices,
  selectedSubmissionTools,
} from "../lib/submission-tools";
import {
  participantExportHref,
  type ParticipantRecordState,
} from "../lib/participant-filters";
import DotAvatar from "./dot-avatar";
import {
  dotColors,
  dotExpressions,
  teamColorKeys,
  teamDotColors,
  teamColorLabels,
} from "../lib/avatar-contract";
import {
  useEffect,
  useId,
  useState,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import Home from "./home";
import ProfileFlow from "./profile-flow";
import AdminImportDialog from "./admin-import-dialog";
import AdminStatusMenu from "./admin-status-menu";
import { trapDialogFocus } from "./dialog-focus";
import AdminParticipantActions, {
  AdminParticipantFilters,
  AdminIcon,
  defaultAdminParticipantFilters,
  filterAdminParticipants,
  type AdminParticipantFiltersValue,
} from "./admin-participant-actions";
import AdminProjectActions from "./admin-project-actions";
import OwnerSubmissionWindow from "./owner-submission-window";
import CreditInstructions from "./credit-instructions";
import ConfirmationDialog from "./confirmation-dialog";
import {
  ActionCancelled,
  ConfirmationGate,
  confirmationFor,
  revealConfirmation,
  requiresActionConfirmation,
  type Confirmation,
} from "../lib/action-confirmation";
import TeamAvatar from "./team-avatar";
import {
  teamPalettes,
  portalRoles,
  type Palette,
} from "../lib/experience-contract";
import { ist } from "../lib/time";
import { defaultPublicContent } from "../lib/event-content-contract";
// Every record is a server-authorized projection; no client-side role filtering
// substitutes for the service's per-request checks.
type Row = Record<string, any>;
type View = Row & {
  me?: {
    id: string;
    name: string;
    email: string;
    role: string;
    owner: boolean;
    avatarColor?: string;
    avatarExpression?: string;
    mode?: "viewer" | "participant" | "staff";
    rostered?: boolean;
    canEngage?: boolean;
    canParticipate?: boolean;
  };
  items?: Row[];
};
async function api(action: string, data: Row) {
  const r = await fetch("/api/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, data }),
    cache: "no-store",
    credentials: "same-origin",
  });
  const b = (await r.json()) as Row;
  if (!r.ok) throw new Error(b.message || b.code || "The request failed.");
  return b as Row;
}
export function portalConfirmationFor(
  action: string,
  values: Row,
  target: string,
): Confirmation {
  const base = confirmationFor(action, values, target);
  if (action === "team-invite")
    return { ...base, title: "Send team invitation?", target: values.email || target, description: "", confirmLabel: "Send invitation" };
  if (action === "team-respond")
    return { ...base, title: values.decision === "accepted" ? "Join this team?" : "Decline invitation?", description: "", confirmLabel: values.decision === "accepted" ? "Join team" : "Decline" };
  if (action === "respond-team")
    return {
      ...base,
      title: values.accept
        ? "Accept membership request?"
        : "Decline membership request?",
      confirmLabel: values.accept ? "Accept" : "Decline",
    };
  if (action === "delete-own-team")
    return {
      ...base,
      title: "Delete your team",
      description:
        "Remove your unlocked, sole-member team after dependency checks. This is recoverable and preserves history. A project or allocation dependency can block deletion.",
      confirmLabel: "Delete this team",
      critical: true,
    };
  if (action === "participant-deactivate")
    return {
      ...base,
      title: "Remove participant",
      description:
        "Remove this specific participant from active participation. Revoke private access, credits and mutation eligibility while retaining their history. Imports cannot restore them. Owner and leader dependencies can block removal.",
      confirmLabel: "Remove this participant",
      critical: true,
    };
  if (action === "participant-restore")
    return {
      ...base,
      title: "Restore participant",
      description:
        "Restore this specific removed participant. The server checks their participation and dependencies again. This does not grant an administrative role.",
      confirmLabel: "Restore this participant",
      critical: true,
    };
  if (action === "project-soft-delete" || action === "project-restore") {
    const scope =
      values.scope === "both"
        ? "project and selected submission"
        : values.scope === "submission"
          ? "selected submission"
          : "project";
    const restoring = action === "project-restore";
    return {
      ...base,
      title: `${restoring ? "Restore" : "Remove"} ${scope}`,
      description: restoring
        ? "Restore this exact project or submission target under server eligibility checks. Existing votes, comments, immutable history and the used attempt count are preserved."
        : "Apply a recoverable removal to this exact target. Votes, comments, immutable history and used attempts remain intact. Removing a version does not automatically expose an older version.",
      confirmLabel: `${restoring ? "Restore" : "Remove"} this target`,
      critical: true,
    };
  }
  if (action === "save-operational-setup")
    return {
      ...base,
      title: "Confirm operational setup",
      description: `Save the reviewed ${values.operation === "checkin" ? "check-in" : "submission"} rules and shared indefinite-retention notice. Existing enabled scopes stay unchanged; this does not enable operations or confirm any judging policy.`,
      confirmLabel: "Save these confirmations",
      critical: true,
    };
  if (action === "publish-submission-window")
    return {
      ...base,
      title: "Publish submission window",
      description:
        "Publish the previewed opening and closing times as real portal settings for all teams. Existing commits and attempts remain intact. The fixed repository creation and first-commit cutoff stays 1 November, 08:00 IST.",
      confirmLabel: "Publish these times",
      critical: true,
    };
  if (action === "engagement-control")
    return {
      ...base,
      title: "Change community engagement",
      description: `Voting will be ${values.votingPaused ? "paused" : "open"}; public feedback will be ${values.feedbackPaused ? "paused" : "open"}. This applies to community actions across projects. Existing votes, comments and frozen scores remain unchanged.`,
      confirmLabel: "Apply engagement settings",
      critical: true,
    };
  if (action === "add-admin")
    return {
      ...base,
      title: "Add admin?",
      target: values.email || "",
      description: "",
      confirmLabel: "Confirm",
      critical: true,
    };
  if (action === "commit-import")
    return {
      ...base,
      title: "Add participants?",
      target: values.singleEmail || `${values.newCount || 0} participants`,
      description: "",
      confirmLabel: "Confirm",
      critical: false,
    };
  return base;
}
export function portalTargetName(data: View, values: Row): string {
  if (values.expectedLeaderId && values.teamId && values.userId) {
    const team = (data.items || []).find((item: Row) => item.id === values.teamId);
    const oldLeader = team?.members?.find((member: Row) => member.id === values.expectedLeaderId);
    const nextLeader = team?.members?.find((member: Row) => member.id === values.userId);
    return `${team?.name || values.teamId} · ${oldLeader?.name || values.expectedLeaderId} → ${nextLeader?.name || values.userId}`;
  }
  const id =
    values.columnId ||
    values.batchId ||
    values.targetId ||
    values.userId ||
    values.projectId ||
    values.teamId ||
    values.typeId ||
    values.requestId;
  const record = [
    ...(data.project ? [data.project] : []),
    ...(data.items || []),
    ...(data.roles || []),
    ...(data.members || []),
    ...(data.items || []).flatMap((item: Row) => item.members || []),
    ...(data.reviewers || []),
    ...(data.actions || []),
    ...(data.creditInstructions || []),
    ...(data.creditBatches || []).map((batch: Row) => ({...batch,name:batch.columns.map((c:Row)=>c.heading).join(", ")})),
    ...(data.creditBatches || []).flatMap((batch:Row)=>batch.columns.map((c:Row)=>({...c,name:c.heading}))),
  ].find(
    (r: Row) =>
      typeof id === "string" &&
      id.length > 0 &&
      (r.id === id || r.user_id === id),
  );
  if (values.kind === "person" && values.targetId)
    return portalTargetName(data, { userId: values.targetId });
  if (values.requestId && record)
    return `${record.person_name || "Applicant"} · ${record.team_name || data.team?.name || "Team"}`;
  if (values.minutes && data.policy?.submissionClose)
    return `Submission deadline → ${ist(new Date(Date.parse(data.policy.submissionClose) + Number(values.minutes) * 60000).toISOString())}`;
  if (
    typeof values.votingPaused === "boolean" &&
    typeof values.feedbackPaused === "boolean"
  )
    return `All projects · voting ${values.votingPaused ? "paused" : "open"} · public feedback ${values.feedbackPaused ? "paused" : "open"} · settings version ${values.version}`;
  if (values.weights) return "Global scoring weights · all teams";
  if (values.operation)
    return values.operation === "submissions"
      ? "Submission operations"
      : "Check-in operations";
  if (values.position) return `Award ${values.position}`;
  if (values.snapshotId) return `Frozen snapshot ${values.snapshotId}`;
  if (values.projectId) {
    const version = (
      record?.versions ||
      data.versions ||
      data.project?.versions ||
      []
    ).find((v: Row) => v.id === values.versionId);
    return `${record?.projectName || record?.draft?.projectName || record?.name || values.projectName || values.projectId} · ID ${values.projectId}${values.versionId ? ` · ${version?.attempt ? `Version ${version.attempt}` : "submission"} (ID ${values.versionId})` : ""} · ${values.scope === "both" ? "project and submission" : values.scope === "submission" ? "submission" : "project"}`;
  }
  if (values.open && values.close)
    return `${ist(values.open)} → ${ist(values.close)}`;
  if (values.kind === "roster" && values.digest)
    return `Previewed roster import · digest ${String(values.digest).slice(0, 16)}`;
  if(values.columns && Array.isArray(values.columns)) return values.columns.map((column:Row)=>column.heading).join(", ")+(values.newCount?` · ${values.newCount} codes`:"");
  if (values.scope === "private") return "Private venue and directions";
  if (values.scope === "public") return "Public agenda, rules, FAQ and venue";
  if (values.userIds)
    return (values.userIds as string[])
      .map((userId) => portalTargetName(data, { userId }))
      .join("; ");
  if (values.emails) return (values.emails as string[]).join(", ");
  if (values.userId)
    return [
      record?.name || record?.person_name,
      record?.email,
      `ID ${values.userId}`,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    record?.name ||
    record?.projectName ||
    record?.person_name ||
    record?.email ||
    values.project?.projectName ||
    values.name ||
    (id ? String(id) : data.team?.name || data.me?.name || "This portal record")
  );
}
type IconName =
  | "home"
  | "dashboard"
  | "discover"
  | "projects"
  | "leaderboard"
  | "rules"
  | "settings"
  | "logs"
  | "menu"
  | "close"
  | "eye"
  | "copy"
  | "up"
  | "history"
  | "person"
  | "users"
  | "team"
  | "credits";
function navigationIcon(label: string): IconName {
  return ({ Home: "home", Dashboard: "dashboard", Discover: "discover", Participants: "users", Teams: "team", Projects: "projects", Leaderboard: "leaderboard", Rules: "rules", Settings: "settings", Logs: "logs", Credits: "credits", Workspace: "dashboard", Administration: "settings", "Assigned projects": "projects" } as Record<string, IconName>)[label] || "projects";
}
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Component = {
    credits: Ticket,
    home: House,
    dashboard: LayoutDashboard,
    discover: Compass,
    projects: BriefcaseBusiness,
    leaderboard: ChartNoAxesColumnIncreasing,
    rules: FileText,
    settings: SlidersHorizontal,
    logs: ClipboardList,
    menu: Menu,
    close: X,
    eye: Eye,
    copy: Copy,
    up: ArrowUp,
    history: History,
    person: UserRound,
    users: Users,
    team: UsersRound,
  }[name];
  return (
    <Component
      className="ui-icon"
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  );
}
export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return;
  }
}
export function safeProfileUrl(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^\/discover\/participants#person-[a-zA-Z0-9_-]+$/.test(value)
    ? value
    : undefined;
}
function SocialLinks({ socials = [] }: { socials?: string[] }) {
  return (
    <div className="member-socials">
      {socials.map((url, index) => {
        const href = safeExternalUrl(url);
        if (!href) return null;
        return (
          <a
            key={`${url}-${index}`}
            className="text-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {new URL(href).hostname.replace(/^www\./, "")}
          </a>
        );
      })}
    </div>
  );
}
function Field({
  name,
  label,
  value = "",
  type = "text",
  required = false,
  minLength,
  children,
}: {
  name: string;
  label: string;
  value?: any;
  type?: string;
  required?: boolean;
  minLength?: number;
  children?: ReactNode;
}) {
  if (name === "reason") return null;
  return (
    <label>
      <span>{label}{required && <span className="required-mark" aria-hidden="true"> *</span>}</span>
      {children ||
        (type === "textarea" ? (
          <textarea
            name={name}
            defaultValue={String(value || "")}
            required={required}
            minLength={minLength}
            rows={4}
          />
        ) : type === "checkbox" ? (
          <input name={name} type="checkbox" defaultChecked={!!value} />
        ) : (
          <input
            name={name}
            type={type}
            defaultValue={String(value || "")}
            required={required}
            minLength={minLength}
          />
        ))}
    </label>
  );
}
function Form({
  title,
  children,
  onSave,
  label = "Save",
  className = "panel",
  disabled = false,
  disabledReason,
}: {
  title?: string;
  children: ReactNode;
  onSave: (data: FormData) => Promise<void>;
  label?: string;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const hydrated = useHydrated();
  const disabledReasonId = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={className}
      method="post"
      inert={!hydrated}
      data-hydrated={hydrated}
      aria-busy={!hydrated || busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (disabled || busy) return;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await onSave(f);
        } catch (err) {
          if (!(err instanceof ActionCancelled))
            setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {title && <h2>{title}</h2>}
      {children}
      <div className="form-actions">
        <button
          className="button"
          disabled={!hydrated || busy || disabled}
          title={disabled ? disabledReason : undefined}
          aria-describedby={
            disabled && disabledReason ? disabledReasonId : undefined
          }
        >
          {busy ? "Saving…" : label}
        </button>
      </div>
      {disabled && disabledReason && (
        <p id={disabledReasonId} className="control-feedback">
          {disabledReason}
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </form>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>Nothing here just yet.</h2>
      <p>{children}</p>
    </div>
  );
}
function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function Search({
  value,
  onChange,
  label = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="search-label">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Profile({
  data,
  run,
  gated = false,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
  gated?: boolean;
}) {
  return <ProfileFlow data={data} run={run} />;
}

function AvatarChooser({
  palette,
  setPalette,
  name = "Team",
}: {
  palette: string;
  setPalette: (v: string) => void;
  name?: string;
}) {
  return (
    <>
      <div className="badge-preview">
        <TeamAvatar name={name} palette={palette} size={88} />
      </div>
      <fieldset className="team-color-fieldset">
        <legend>Team color <output className="team-color-name" aria-live="polite">{teamColorLabels[palette] || "Green"}</output></legend>
        <div className="palette-picker">
          {teamColorKeys.map((key) => (
            <label key={key} title={teamColorLabels[key]} className="team-color-choice" data-selected={palette === key}>
              <input
                type="radio"
                className="team-color-radio"
                name="palette"
                value={key}
                checked={palette === key}
                onChange={() => setPalette(key)}
              />
              <span
                className="palette-swatch"
                aria-hidden="true"
                style={{ background: teamDotColors[key] }}
              />
              <span className="sr-only">{teamColorLabels[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function CreateTeam({ run }: { run: (a: string, d: Row) => Promise<Row> }) {
  const [name, setName] = useState(""),
    [palette, setPalette] = useState("forest");
  return (
    <Form
      title="Create your team"
      className="panel team-create-form"
      label="Create team"
      onSave={async (f) => {
        await run("create-workspace-team", {
          name: f.get("name"),
          bio: f.get("bio"),
          avatar: "initials",
          palette,
        });
      }}
    >
      <div className="team-create-layout">
        <div className="team-create-fields">
          <label>
            <span>
              Team name{" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <input
              name="name"
              required
              maxLength={80}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Field
            name="bio"
            label="What would you like to build?"
            type="textarea"
          />
        </div>
        <div className="team-create-identity">
          <AvatarChooser name={name || "Team"} {...{ palette, setPalette }} />
        </div>
      </div>
    </Form>
  );
}
function TeamAction({
  action,
  values,
  run,
  children,
  className = "button secondary",
  disabled = false,
}: {
  action: string;
  values: Row;
  run: (a: string, d: Row) => Promise<Row>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  return (
    <div className="team-inline-action">
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            await run(action, values);
          } catch (error) {
            if (!(error instanceof ActionCancelled))
              setError((error as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        {children}
      </button>
      {error && (
        <p className="team-action-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function TeamInvitations({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const invitations = (data.actions || []).filter(
    (action: Row) =>
      action.kind === "invite" &&
      action.status === "pending" &&
      action.user_id === data.me?.id,
  );
  if (!invitations.length) return null;
  return (
    <section className="team-invitations" aria-label="Team invitations">
      <h3>
        Invitations <span>{invitations.length}</span>
      </h3>
      {invitations.map((invitation: Row) => (
        <div className="team-request-item" key={invitation.id}>
          <strong>{invitation.team_name}</strong>
          <div className="team-request-actions">
            <TeamAction
              action="team-respond"
              values={{ id: invitation.id, decision: "accepted" }}
              run={run}
            >
              Accept invitation
            </TeamAction>
            <TeamAction
              action="team-respond"
              values={{ id: invitation.id, decision: "declined" }}
              run={run}
              className="link-button"
            >
              Decline
            </TeamAction>
          </div>
        </div>
      ))}
    </section>
  );
}
function TeamStyle({
  team,
  run,
}: {
  team: Row;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [palette, setPalette] = useState(team.palette || "forest");
  return (
    <section className="team-settings-appearance">
      <Form
        className="inset-form"
        onSave={async () => {
          await run("team-style", { avatar: "initials", palette });
        }}
        label="Save appearance"
      >
        <AvatarChooser name={team.name} {...{ palette, setPalette }} />
      </Form>
    </section>
  );
}
export function TeamWorkspace({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [description, setDescription] = useState(data.idea?.description || "");
  const t = data.team;
  const leader = !!t && data.me?.id === t.leader_id;
  const locked = !!(t?.locked || data.ideaLocked);
  const requests = (data.actions || []).filter(
    (action: Row) =>
      action.kind === "request" &&
      action.status === "pending" &&
      action.team_id === t?.id,
  );
  const invitations = (data.actions || []).filter(
    (action: Row) =>
      action.kind === "invite" &&
      action.status === "pending" &&
      action.team_id === t?.id,
  );
  if (!t)
    return (
      <div className="dashboard-empty-team">
        <TeamInvitations data={data} run={run} />
        <section className="team-find-panel">
          <div className="team-empty-mark">
            <UsersRound size={28} aria-hidden="true" />
          </div>
          <h3>Find your people.</h3>
          <a className="button secondary" href="/discover/teams">
            Discover teams <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
        {data.me?.canParticipate === true && <CreateTeam run={run} />}
      </div>
    );
  return (
    <section className="team-workspace dashboard-team">
      <div className="dashboard-team-heading">
        <TeamAvatar name={t.name} palette={t.palette} size={64} />
        <div className="dashboard-team-title">
          <h3>{t.name}</h3>
          {t.bio && <p>{t.bio}</p>}
        </div>
        <Pill tone={locked ? "locked" : "neutral"}>
          {locked && <LockKeyhole size={16} aria-hidden="true" />}
          {locked ? "Locked" : data.teamStatus || "Forming"}
        </Pill>
      </div>
      {data.privateVenue && <DashboardVenue venue={data.privateVenue} />}
      <div className="dashboard-team-grid">
        <section
          className="dashboard-members"
          aria-labelledby="dashboard-members-heading"
        >
          <div className="team-section-heading">
            <h3 id="dashboard-members-heading">Team members</h3>
            <span>{data.members?.length || 0}/5</span>
          </div>
          <ul className="member-list dashboard-member-list">
            {(data.members || []).map((m: Row) => (
              <li key={m.id}>
                <DotAvatar
                  color={m.avatarColor}
                  expression={m.avatarExpression}
                  size={40}
                />
                <div className="dashboard-member-name">
                  <strong>
                    {safeProfileUrl(m.profileUrl) ? (
                      <a
                        className="text-link"
                        href={safeProfileUrl(m.profileUrl)}
                      >
                        {m.name}
                      </a>
                    ) : (
                      m.name
                    )}
                  </strong>
                  <span className="sr-only">
                    {m.status ||
                      (m.approval === "approved" ? "Going" : "Registered")}
                  </span>
                  {m.role === "leader" && <Pill tone="positive">Leader</Pill>}
                </div>
                <div className="dashboard-member-contact">
                  <div className="dashboard-member-links">
                    {discoverySocialLinks(
                      Array.isArray(m.socials) ? m.socials : [],
                    ).map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${m.name} on ${link.label}`}
                        title={link.label}
                      >
                        <img
                          src={`/icons/social/${link.icon}.svg`}
                          width={22}
                          height={22}
                          alt=""
                        />
                      </a>
                    ))}
                    {safeExternalUrl(m.whatsappUrl) && (
                      <a
                        className="dashboard-whatsapp"
                        href={safeExternalUrl(m.whatsappUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open WhatsApp chat with ${m.name}`}
                        title="WhatsApp"
                      >
                        <img
                          src="/icons/social/whatsapp.svg"
                          width={23}
                          height={23}
                          alt=""
                        />
                      </a>
                    )}
                  </div>
                  {m.phone && (
                    <a
                      className="dashboard-member-phone"
                      href={`tel:${String(m.phone).replace(/[^+0-9]/g, "")}`}
                    >
                      <Phone size={15} aria-hidden="true" />
                      {m.phone}
                    </a>
                  )}
                </div>
                {leader && !locked && m.role !== "leader" && (
                  <TeamAction
                    action="remove-workspace-member"
                    values={{
                      userId: m.id,
                      reason: "Team leader removed membership",
                    }}
                    run={run}
                    className="dashboard-icon-button dashboard-remove"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                    <span className="sr-only">Remove {m.name} from team</span>
                  </TeamAction>
                )}
              </li>
            ))}
          </ul>
          {leader && !locked && Number(data.members?.length || 0) < 5 && (
            <a className="team-find-people" href="/discover/participants">
              <Plus size={17} aria-hidden="true" />
              Find teammates
            </a>
          )}
          {leader && !locked && requests.length > 0 && (
            <section
              className="team-membership-requests"
              aria-label="Membership requests"
            >
              <h4>
                Requests <span>{requests.length}</span>
              </h4>
              {requests.map((r: Row) => (
                <div className="team-request-item" key={r.id}>
                  <strong>{r.person_name}</strong>
                  <div className="team-request-actions">
                    <TeamAction
                      action="respond-team"
                      values={{ requestId: r.id, accept: true }}
                      run={run}
                    >
                      Accept
                    </TeamAction>
                    <TeamAction
                      action="respond-team"
                      values={{ requestId: r.id, accept: false }}
                      run={run}
                      className="link-button"
                    >
                      Decline
                    </TeamAction>
                  </div>
                </div>
              ))}
            </section>
          )}
        </section>
        <section
          className="dashboard-idea"
          aria-labelledby="dashboard-idea-heading"
        >
          <div className="team-section-heading">
            <h3 id="dashboard-idea-heading">Team idea</h3>
            <LockKeyhole
              size={16}
              aria-label="Private to team members and admins"
            />
          </div>
          {leader && !locked ? (
            <>
              <Form
                className="dashboard-idea-form"
                disabled={locked}
                label="Save team idea"
                onSave={async (f) => {
                  await run("save-workspace-idea", {
                    title: f.get("title"),
                    description: description.trim(),
                  });
                }}
              >
                <fieldset disabled={locked}>
                  <Field
                    name="title"
                    label="Idea title"
                    value={data.idea?.title}
                    required
                  />
                  <label>
                    <span>
                      Short description{" "}
                      <span className="required-mark" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <textarea
                      name="description"
                      required
                      maxLength={500}
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      aria-describedby="idea-count"
                    />
                    <small id="idea-count">{description.length}/500</small>
                  </label>
                </fieldset>
              </Form>
              <div className="dashboard-lock-actions">
                <TeamAction
                  action="lock-team"
                  values={{ confirmation: "LOCK_TEAM" }}
                  run={run}
                  disabled={
                    !data.idea?.title?.trim() || !data.idea?.description?.trim()
                  }
                >
                  <LockKeyhole size={17} aria-hidden="true" />
                  Lock team
                </TeamAction>
              </div>
            </>
          ) : data.idea ? (
            <div className="dashboard-locked-idea">
              <div>
                <h4>{data.idea.title}</h4>
              </div>
              <p className="prose">{data.idea.description}</p>
              <span className="dashboard-idea-count">
                {String(data.idea.description || "").length}/500
              </span>
            </div>
          ) : (
            <p className="team-empty-copy">No team idea yet.</p>
          )}
        </section>
      </div>
      {leader && !locked && (
        <details className="dashboard-team-settings">
          <summary>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Team settings
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div className="team-settings-grid">
            <section>
              <Form
                className="inset-form"
                label="Rename team"
                onSave={async (f) => {
                  await run("rename-team", {
                    name: f.get("name"),
                    reason: "Leader renamed unlocked team",
                  });
                }}
              >
                <Field
                  name="name"
                  label="Team name"
                  value={t.name}
                  required
                  minLength={2}
                />
              </Form>
            </section>
            <section className="team-settings-invite">
              <h3>Invite a teammate</h3>
              <Form
                className="inset-form"
                label="Send invitation"
                disabled={Number(data.members?.length || 0) >= 5}
                disabledReason={
                  Number(data.members?.length || 0) >= 5
                    ? "Your team has five members."
                    : undefined
                }
                onSave={async (f) => {
                  await run("team-invite", {
                    teamId: t.id,
                    email: f.get("email"),
                  });
                }}
              >
                <Field name="email" label="Email" type="email" required />
              </Form>
              {invitations.length > 0 && (
                <ul className="team-pending-invites">
                  {invitations.map((r: Row) => (
                    <li key={r.id}>
                      <span>{r.person_name}</span>
                      <span>Invited</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <TeamStyle team={t} run={run} />
          </div>
          {data.members?.length === 1 && (
            <div className="team-delete-action">
              <TeamAction
                action="delete-own-team"
                values={{ confirmation: "DELETE_OWN_TEAM" }}
                run={run}
                className="link-button"
              >
                <Trash2 size={17} aria-hidden="true" />
                Delete team
              </TeamAction>
            </div>
          )}
        </details>
      )}
    </section>
  );
}
function DashboardVenue({ venue }: { venue: Row }) {
  return (
    <section
      className="private-arrival dashboard-venue"
      aria-label="Your arrival details"
    >
      <MapPin size={28} aria-hidden="true" />
      <div>
        <h3>{venue.location}</h3>
        {venue.directions && <p className="prose">{venue.directions}</p>}
      </div>
      {safeExternalUrl(venue.mapUrl) && (
        <a
          className="text-link"
          href={safeExternalUrl(venue.mapUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={20} aria-hidden="true" />
          Google Maps
        </a>
      )}
    </section>
  );
}
function DashboardProject({
  data,
  run,
  editing,
  editorOpen,
  setEditing,
  onExit,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
  editing: boolean;
  editorOpen: boolean;
  setEditing: (value: boolean) => void;
  onExit: () => void;
}) {
  const project = data.project,
    draft = project?.draft || {},
    used = Number.isInteger(data.submissionAccess?.attemptsUsed)
      ? data.submissionAccess.attemptsUsed
      : data.attempts?.length || 0,
    canRead = data.submissionAccess?.canRead === true,
    canEdit =
      data.me?.canParticipate === true &&
      data.team?.leader_id === data.me?.id &&
      data.submissionAccess?.canCommit === true &&
      used < 3 &&
      !data.submissionAccess?.locked;
  if (editorOpen && canRead && canEdit)
    return (
      <Submission
        key={`${project?.revision || 0}-${data.team?.id || "none"}`}
        data={data}
        run={run}
        onExit={onExit}
        exitLabel={
          project?.published_version_id
            ? "Back to your project"
            : "Back to Team"
        }
      />
    );
  return (
    <>
      <div className="dashboard-project-heading">
        {data.team && (
          <div className="identity-line">
            <TeamAvatar
              name={data.team.name}
              palette={data.team.palette}
              size={42}
            />
            <h3>{data.team.name}</h3>
          </div>
        )}
        <Pill tone={used ? "positive" : "neutral"}>
          {used ? "Submitted" : "Not submitted"}
        </Pill>
        {data.projectStats && (
          <span
            className="dashboard-upvotes"
            aria-label={
              Number.isFinite(data.projectStats.upvotes)
                ? `${data.projectStats.upvotes} upvotes`
                : "Upvote count unavailable"
            }
          >
            <ArrowUp size={22} aria-hidden="true" />
            <span aria-hidden="true">
              {Number.isFinite(data.projectStats.upvotes)
                ? data.projectStats.upvotes
                : "?"}
            </span>
          </span>
        )}
      </div>
      {data.projectStats?.result && (
        <PublicResult result={data.projectStats.result} />
      )}
      {canRead ? (
        <>
          <div className="dashboard-project-actions">
            {project?.published_version_id &&
              data.eligibility?.status === "eligible" && (
                <a
                  className="button secondary"
                  href={`/projects/${encodeURIComponent(project.slug)}`}
                >
                  View project
                  <ExternalLink size={17} aria-hidden="true" />
                </a>
              )}
            <ProjectHistory canRead={canRead} label={`Versions ${used}/3`} />
            {canEdit && project?.published_version_id && (
              <button
                className="button secondary"
                id="dashboard-project-edit"
                type="button"
                aria-expanded={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Close editor" : "Update project"}
              </button>
            )}
          </div>
          {project?.published_version_id && !editorOpen && (
            <article className="dashboard-project-card">
              {draft.banner && (
                <img
                  className="dashboard-project-banner"
                  src={draft.banner}
                  alt=""
                />
              )}
              <h3>{draft.projectName}</h3>
              {draft.problemSolution && <p>{draft.problemSolution}</p>}
              {draft.description && (
                <p className="prose">{draft.description}</p>
              )}
            </article>
          )}
          {!project?.published_version_id && !editorOpen && (
            <Submission
              key={`${project?.revision || 0}-${data.team?.id || "none"}`}
              data={data}
              run={run}
            />
          )}
        </>
      ) : (
        <div className="dashboard-empty-state">
          <FileText size={28} aria-hidden="true" />
          <p>
            {data.submissionAccess?.message ||
              "Your project workspace is not available yet."}
          </p>
        </div>
      )}
      {data.eligibility?.status === "ineligible" && (
        <p className="notice">
          Ineligible ·{" "}
          {data.eligibility.reason || "Check your private team feedback."}
        </p>
      )}
      <section
        className="dashboard-feedback"
        aria-label="Private team feedback"
      >
        <h3>Feedback ({data.feedback?.length || 0})</h3>
        {(data.feedback || []).map((f: Row) => (
          <article className="feedback-entry" key={f.id}>
            <div className="dashboard-feedback-heading">
              <UserRound size={22} aria-hidden="true" />
              <strong>{f.author}</strong>
              <span className="pill locked">
                <LockKeyhole size={14} aria-hidden="true" />
                Private
              </span>
            </div>
            <p>{f.body}</p>
            <small>
              {f.kind} · {ist(f.created_at)}
            </small>
          </article>
        ))}
        {!data.feedback?.length && <p>No feedback yet.</p>}
      </section>
    </>
  );
}
export function Dashboard({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [tab, setTab] = useState("team"),
    [projectEditing, setProjectEditing] = useState(false);
  useEffect(() => {
    const sync = () => {
      const value = location.hash.slice(1);
      if (["team", "credits", "project"].includes(value)) setTab(value);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const select = (value: string, focus = false) => {
    setTab(value);
    history.replaceState(null, "", `#${value}`);
    if (focus) document.getElementById(`dashboard-tab-${value}`)?.focus();
  };
  const editorOpen =
    tab === "project" &&
    data.submissionAccess?.canRead === true &&
    data.me?.canParticipate === true &&
    data.team?.leader_id === data.me?.id &&
    data.submissionAccess?.canCommit === true &&
    !data.submissionAccess?.locked &&
    (data.submissionAccess?.attemptsUsed ?? data.attempts?.length ?? 0) < 3 &&
    (!data.project?.published_version_id || projectEditing);
  const exitProjectEditor = () => {
    setProjectEditing(false);
    const published = !!data.project?.published_version_id;
    select(published ? "project" : "team");
    requestAnimationFrame(() =>
      document
        .getElementById(
          published ? "dashboard-project-edit" : "dashboard-tab-team",
        )
        ?.focus(),
    );
  };
  if (data.me?.mode === "viewer")
    return (
      <>
        <header className="page-heading">
          <h1>Welcome</h1>
        </header>
        <div className="form-actions">
          <a className="button" href="/discover/teams">
            Discover
          </a>
          <a className="button secondary" href="/projects">
            Explore projects
          </a>
        </div>
      </>
    );
  return (
    <div className="dashboard-v6" data-editor-open={editorOpen}>
      <header className="page-heading dashboard-heading" hidden={editorOpen}>
        <h1>
          <HeadingDot
            color={(data.me?.avatarColor || "green") as keyof typeof dotColors}
            expression={
              (data.me?.avatarExpression ||
                "squeezed") as keyof typeof dotExpressions
            }
          />
          Dashboard
        </h1>
        <Pill
          tone={
            data.individualStatus === "Checked in" ||
            data.individualStatus === "Going"
              ? "positive"
              : "neutral"
          }
        >
          {data.individualStatus === "Checked in" && (
            <CircleCheck size={18} aria-hidden="true" />
          )}
          {data.individualStatus || "Registered"}
        </Pill>
      </header>
      <nav
        hidden={editorOpen}
        className="dashboard-sections"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {[
          ["team", "Team"],
          ["credits", "Credits"],
          ["project", "Project"],
        ].map(([value, label], index) => (
          <button
            type="button"
            key={value}
            role="tab"
            id={`dashboard-tab-${value}`}
            aria-controls={value}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => select(value)}
            onKeyDown={(event) => {
              const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              select(["team", "credits", "project"][next], true);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <section
        id="team"
        role="tabpanel"
        hidden={tab !== "team"}
        className="dashboard-section"
        aria-labelledby="dashboard-tab-team"
      >
        <TeamWorkspace
          key={`${data.team?.id || "none"}-${data.idea?.description || ""}`}
          data={data}
          run={run}
        />
      </section>
      <section
        id="credits"
        role="tabpanel"
        hidden={tab !== "credits"}
        className="dashboard-section dashboard-credits"
        aria-labelledby="dashboard-tab-credits"
      >
        {(data.credits || []).map((c: Row) => (
          <Credit key={`${tab}-${c.type_id}`} credit={c} />
        ))}
        {!data.credits?.length && (
          <div className="dashboard-empty-state">
            <Ticket size={28} aria-hidden="true" />
            <h3>No credits assigned.</h3>
          </div>
        )}
      </section>
      <section
        id="project"
        role={editorOpen ? "region" : "tabpanel"}
        hidden={tab !== "project"}
        className="dashboard-section"
        aria-label={editorOpen ? "Project submission" : undefined}
        aria-labelledby={editorOpen ? undefined : "dashboard-tab-project"}
      >
        <DashboardProject
          data={data}
          run={run}
          editing={projectEditing}
          editorOpen={editorOpen}
          setEditing={setProjectEditing}
          onExit={exitProjectEditor}
        />
      </section>
    </div>
  );
}
function PublicResult({ result }: { result: Row }) {
  return (
    <span className="public-result">
      {typeof result.score === "number" && Number.isFinite(result.score) && (
        <span>
          {result.score} {result.stage === "ai" ? "AI" : "final"} score
        </span>
      )}
      {typeof result.rank === "number" && result.rank > 0 && (
        <span> · Rank {result.rank}</span>
      )}
      {typeof result.label === "string" && <span> {result.label}</span>}
    </span>
  );
}
export function Credit({ credit }: { credit: Row }) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const pending = useRef(false),
    active = useRef(true),
    revealGeneration = useRef(0);
  useEffect(() => {
    active.current = true;
    const hide = () => {
      ++revealGeneration.current;
      setValue("");
      setCopied(false);
    };
    const visibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <article className="credit-row dashboard-credit">
      <h3>{credit.name}</h3>
      <CreditInstructions markdown={credit.instructions || ""} />
      <div className="credit-secret">
        <code
          aria-label={value ? "Your private allocation" : "Allocation hidden"}
        >
          {value || "••••••••••••••••"}
        </code>
        <button
          type="button"
          className="button secondary"
          disabled={!credit.allocated || busy}
          aria-label={value ? "Hide allocation" : "Reveal my allocation"}
          aria-pressed={!!value}
          onClick={async () => {
            if (value) {
              setValue("");
              setCopied(false);
              return;
            }
            if (pending.current) return;
            pending.current = true;
            const generation = ++revealGeneration.current;
            setBusy(true);
            setError("");
            try {
              const result = await api("reveal-credit", {
                typeId: credit.type_id,
              });
              if (typeof result.value !== "string" || !result.value)
                throw new Error("Your allocation could not be revealed.");
              if (
                active.current &&
                generation === revealGeneration.current &&
                !document.hidden
              )
                setValue(result.value);
            } catch (e) {
              if (active.current) setError((e as Error).message);
            } finally {
              pending.current = false;
              if (active.current) setBusy(false);
            }
          }}
        >
          {value ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
          <span className="sr-only">
            {busy ? "Revealing…" : value ? "Hide" : "Reveal"}
          </span>
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={!value || busy}
          aria-label={copied ? "Copied allocation" : "Copy allocation"}
          onClick={async () => {
            setError("");
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              setError("Copy failed. Select and copy the revealed value.");
            }
          }}
        >
          <Copy size={20} aria-hidden="true" />
          <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function discoveryProfileProjection(row: Row): DiscoveryPerson {
  const teamName = typeof row.teamName === "string" ? row.teamName.trim() : "";
  return {
    name: String(row.name || "Participant"),
    bio: String(row.bio || ""),
    socials: Array.isArray(row.socials)
      ? row.socials.filter((value: unknown) => typeof value === "string")
      : [],
    avatarColor: String(row.avatarColor || "blue"),
    avatarExpression: String(row.avatarExpression || "squeezed"),
    ...(teamName
      ? {
          team: {
            name: teamName,
            ...(typeof row.teamPalette === "string"
              ? { palette: row.teamPalette }
              : {}),
          },
        }
      : {}),
  };
}

function DiscoverSocials({ socials = [] }: { socials?: string[] }) {
  const links = discoverySocialLinks(socials);
  if (!links.length) return null;
  return (
    <nav className="discover-socials" aria-label="Social links">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${link.label} (opens in a new tab)`}
        >
          <img
            src={`/icons/social/${link.icon}.svg`}
            width={24}
            height={24}
            alt=""
          />
        </a>
      ))}
    </nav>
  );
}

function DiscoverTeamDialog({
  team,
  onClose,
}: {
  team: Row;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const callback = useRef(onClose);
  useEffect(() => {
    callback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (dialog.current)
      return openDiscoveryDialog(dialog.current, () => callback.current());
  }, []);
  return (
    <dialog
      ref={dialog}
      className="discover-team-dialog-v6"
      onKeyDown={trapDialogFocus}
      aria-labelledby="discover-team-title"
    >
      <button
        type="button"
        className="discover-dialog-close"
        autoFocus
        aria-label="Close team"
        onClick={() => dialog.current?.close()}
      >
        <X size={22} aria-hidden="true" />
      </button>
      <TeamAvatar name={team.name} palette={team.palette} size={80} />
      <h2 id="discover-team-title">{team.name}</h2>
      <span className={`discover-state ${team.locked ? "locked" : "forming"}`}>
        {team.status || (team.locked ? "Locked" : "Forming")}
      </span>
      <p>{team.readiness?.total ?? "?"}/5 members</p>
      {team.bio && <p className="discover-team-bio">{team.bio}</p>}
    </dialog>
  );
}

function CreateTeamDialog({
  run,
  onClose,
}: {
  run: (a: string, d: Row) => Promise<Row>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    callback = useRef(onClose);
  useEffect(() => {
    callback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (dialog.current)
      return openDiscoveryDialog(dialog.current, () => callback.current());
  }, []);
  return (
    <dialog
      ref={dialog}
      className="team-create-dialog"
      onKeyDown={trapDialogFocus}
      aria-label="Create team"
    >
      <button
        type="button"
        className="discover-dialog-close"
        autoFocus
        aria-label="Close team creation"
        onClick={() => dialog.current?.close()}
      >
        <X size={22} aria-hidden="true" />
      </button>
      <CreateTeam run={run} />
    </dialog>
  );
}

export function Discover({
  data,
  path,
  run,
}: {
  data: View;
  path: string;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [search, setSearch] = useState(""),
    [teamFilter, setTeamFilter] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<DiscoveryPerson | null>(
    null,
  );
  const [selectedTeam, setSelectedTeam] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const hashOpened = useRef("");
  const participants = path === "/discover/participants";
  const people = useDiscoverPeople(data, search, teamFilter, participants);
  const canCreate = data.me?.canParticipate === true && !data.team;
  const [focusError, setFocusError] = useState("");
  useEffect(() => {
    if (!participants) return;
    let controller: AbortController | null = null;
    let disposed = false;
    const openHash = async () => {
      controller?.abort();
      const hash = window.location.hash;
      if (!/^#person-[A-Za-z0-9_-]+$/.test(hash) || hashOpened.current === hash)
        return;
      const personId = hash.slice("#person-".length);
      let row = people.items.find((person: Row) => person.id === personId);
      if (!row && data.focusedPerson?.id === personId) row = data.focusedPerson;
      setFocusError("");
      if (!row) {
        controller = new AbortController();
        const request = controller;
        try {
          const page = await readPeoplePage(
            peopleDirectoryUrl({ person: personId }),
            request.signal,
          );
          if (
            disposed ||
            request.signal.aborted ||
            window.location.hash !== hash
          )
            return;
          row = page.focusedPerson || undefined;
        } catch {
          if (!disposed && !request.signal.aborted)
            setFocusError("Profile could not be loaded.");
          return;
        }
      }
      if (!row || disposed) {
        if (!disposed) setFocusError("Profile unavailable.");
        return;
      }
      hashOpened.current = hash;
      document
        .getElementById(`person-${row.id}`)
        ?.scrollIntoView({ block: "center", behavior: "auto" });
      setSelectedPerson(discoveryProfileProjection(row));
    };
    const navigateHash = () => {
      hashOpened.current = "";
      void openHash();
    };
    void openHash();
    window.addEventListener("hashchange", navigateHash);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("hashchange", navigateHash);
    };
  }, [participants, people.items, data.focusedPerson]);
  const items = participants
    ? people.items
    : (data.items || []).filter((row) =>
        `${row.name || ""} ${row.bio || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      );
  return (
    <section className="discover-v6">
      <header className="discover-heading">
        <h1>
          <HeadingDot
            color="blue"
            expression="squeezed"
            size="var(--directory-heading-size, 52px)"
          />
          Discover
        </h1>
        {!participants && canCreate && (
          <button
            type="button"
            className="button discover-create-trigger"
            aria-haspopup="dialog"
            onClick={() => setCreating(true)}
          >
            <Plus size={18} aria-hidden="true" />
            Create team
          </button>
        )}
      </header>
      <nav className="discover-tabs" aria-label="Discover">
        <a
          href="/discover/participants"
          aria-current={participants ? "page" : undefined}
        >
          People
        </a>
        <a
          href="/discover/teams"
          aria-current={!participants ? "page" : undefined}
        >
          Teams
        </a>
      </nav>
      <div className="discover-toolbar">
        <label className="discover-search">
          <SearchIcon size={22} aria-hidden="true" />
          <span className="sr-only">
            {participants ? "Search people" : "Search teams"}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={participants ? "Search people" : "Search teams"}
          />
        </label>
        {participants && (
          <div
            className="discover-membership-filters"
            role="group"
            aria-label="Team membership"
          >
            {[
              ["", "All"],
              ["in", "In a team"],
              ["out", "Not in a team"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={teamFilter === value}
                onClick={() => setTeamFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul
        className={`discover-directory ${participants ? "discover-people discover-people-cards" : "discover-teams"}`}
        aria-label={participants ? "People" : "Teams"}
        aria-busy={participants ? people.loading : undefined}
      >
        {items.map((row) => (
          <li
            key={row.id}
            id={participants ? `person-${row.id}` : undefined}
            data-has-bio={!!row.bio}
          >
            {participants ? (
              <>
                <DotAvatar
                  color={row.avatarColor}
                  expression={row.avatarExpression}
                  size={56}
                  decorative
                />
                <div className="discover-identity">
                  <h2>{row.name}</h2>
                  {row.bio && <p>{row.bio}</p>}
                </div>
                <div className="discover-card-membership">
                  <span
                    className={`discover-membership ${row.teamName ? "joined" : "unjoined"}`}
                  >
                    {row.teamName ? "In a team" : "Not in a team"}
                  </span>
                  {row.teamName && (
                    <span className="discover-card-team-name">
                      {row.teamName}
                    </span>
                  )}
                </div>
                <DiscoverSocials socials={row.socials} />
                <button
                  type="button"
                  className="discover-profile-open"
                  aria-label={`View ${row.name}'s profile`}
                  aria-haspopup="dialog"
                  onClick={() =>
                    setSelectedPerson(discoveryProfileProjection(row))
                  }
                >
                  <ChevronRight size={22} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <TeamAvatar name={row.name} palette={row.palette} size={56} />
                <div className="discover-identity">
                  <h2>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setSelectedTeam(row)}
                    >
                      {row.name}
                    </button>
                  </h2>
                  <p>{row.readiness?.total ?? "?"}/5 members</p>
                </div>
                <span
                  className={`discover-state ${row.locked ? "locked" : "forming"}`}
                >
                  {row.status || (row.locked ? "Locked" : "Forming")}
                </span>
                {row.bio && <p className="discover-team-summary">{row.bio}</p>}
                <div className="discover-team-action">
                  {data.team?.id === row.id ? (
                    <a href="/dashboard" className="discover-view-team">
                      Your team
                    </a>
                  ) : canCreate &&
                    !row.locked &&
                    Number(row.readiness?.total) < 5 ? (
                    <TeamAction
                      action="request-team"
                      values={{ teamId: row.id }}
                      run={run}
                      className="discover-request"
                      disabled={!!row.requested}
                    >
                      {row.requested ? "Requested" : "Request to join"}
                    </TeamAction>
                  ) : (
                    <button
                      type="button"
                      className="discover-view-team"
                      aria-haspopup="dialog"
                      onClick={() => setSelectedTeam(row)}
                    >
                      View team
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
        {participants &&
          people.loading &&
          Array.from({ length: items.length ? 3 : 6 }, (_, index) => (
            <li
              className="discover-person-skeleton"
              key={`loading-${index}`}
              aria-hidden="true"
            >
              <span className="discover-skeleton-avatar" />
              <span className="discover-skeleton-name" />
              <span className="discover-skeleton-bio" />
              <span className="discover-skeleton-badge" />
            </li>
          ))}
      </ul>
      {participants && focusError && (
        <p className="team-action-error" role="alert">
          {focusError}
        </p>
      )}
      {participants && (
        <div className="discover-pagination" ref={people.sentinel}>
          <p role="status" aria-live="polite">
            {people.loading
              ? "Loading people…"
              : people.error
                ? ""
                : people.hasMore
                  ? ""
                  : items.length
                    ? "All people loaded"
                    : ""}
          </p>
          {people.error && <p role="alert">{people.error}</p>}
          {(people.hasMore || people.error) && (
            <button
              type="button"
              disabled={people.loading}
              onClick={() => void people.loadMore()}
            >
              {people.error ? "Retry" : "Load more"}
            </button>
          )}
        </div>
      )}
      {!items.length &&
        (!participants || (!people.loading && !people.error)) && (
          <p className="discover-empty">
            {search || teamFilter
              ? "No matches"
              : participants
                ? "No people yet"
                : "No teams yet"}
          </p>
        )}
      {creating && canCreate && (
        <CreateTeamDialog
          onClose={() => setCreating(false)}
          run={async (action, values) => {
            const result = await run(action, values);
            if (action === "create-workspace-team") setCreating(false);
            return result;
          }}
        />
      )}
      {selectedPerson && (
        <DiscoveryProfile
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}
      {selectedTeam && (
        <DiscoverTeamDialog
          team={selectedTeam}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </section>
  );
}

export function SharedRules({ categories = [] }: { categories?: Row[] }) {
  return (
    <section className="rules-v6">
      <header className="rules-heading">
        <a href="/dashboard" aria-label="Back to Dashboard">
          <ArrowLeft size={22} aria-hidden="true" />
        </a>
        <h1>
          <HeadingDot
            color="orange"
            expression="sleepy"
            size="var(--directory-heading-size, 52px)"
          />
          Rules
        </h1>
      </header>
      <div className="rules-accordion">
        {categories.map((category, index) => (
          <details key={category.title} open={index === 0}>
            <summary>
              <span>{category.title}</span>
              <ChevronDown size={22} aria-hidden="true" />
            </summary>
            <ol>
              {category.items.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}

const emptyProject = {
  projectName: "",
  problemSolution: "",
  description: "",
  github: "",
  demo: "",
  logo: "",
  banner: "",
  tools: "",
  cerebrasIntegration: undefined,
  attestation: false,
};
export function Submission({
  data,
  run,
  onExit,
  exitLabel = "Back to your project",
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
  onExit?: () => void;
  exitLabel?: string;
}) {
  const initial = { ...emptyProject, ...data.project?.draft };
  const [project, setProject] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [step, setStep] = useState(1);
  const wizardHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step !== 1) wizardHeading.current?.focus();
  }, [step]);
  const next = () => {
    setError("");
    if (
      step === 1 &&
      (!project.projectName?.trim() ||
        !project.problemSolution?.trim() ||
        !project.description?.trim())
    ) {
      setError("Add a project name, summary and description.");
      return;
    }
    if (step === 2 && !/^https:\/\/github\.com\//.test(project.github || "")) {
      setError("Add your GitHub repository.");
      return;
    }
    setStep(Math.min(3, step + 1));
  };
  const leader = data.team?.leader_id === data.me?.id;
  const attemptsUsed = Number.isInteger(data.submissionAccess?.attemptsUsed)
    ? data.submissionAccess.attemptsUsed
    : data.attempts?.length || 0;
  const remaining = Math.max(0, 3 - attemptsUsed);
  const canCommit =
    leader &&
    data.me?.canParticipate === true &&
    data.submissionAccess?.canCommit === true &&
    !data.submissionAccess?.locked &&
    attemptsUsed < 3;
  const saving = useRef(false);
  const set = (name: string, value: unknown) => {
    setProject((p: Row) => ({ ...p, [name]: value }));
    const corrected = { ...project, [name]: value };
    setError((current) =>
      (current === "Add a project name, summary and description." &&
        ["projectName", "problemSolution", "description"].includes(name) &&
        corrected.projectName?.trim() &&
        corrected.problemSolution?.trim() &&
        corrected.description?.trim()) ||
      (current === "Add your GitHub repository." &&
        name === "github" &&
        /^https:\/\/github\.com\//.test(String(value))) ||
      (current === "Confirm this submission is accurate." &&
        name === "attestation" &&
        value === true)
        ? ""
        : current,
    );
  };
  const upload = async (file: File | undefined, kind: string) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 131072
    ) {
      setError("Use a PNG or JPEG at most 128 KB. Logo: 1:1. Banner: 16:9.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set(kind, String(reader.result));
      setError("");
    };
    reader.onerror = () => setError("That image could not be read.");
    reader.readAsDataURL(file);
  };
  const save = async (submit = false) => {
    if (!canCommit || saving.current) return;
    if (submit && (!project.logo || !project.banner || !project.attestation)) {
      setError(
        !project.logo || !project.banner
          ? "Add your square logo and 16:9 banner."
          : "Confirm this submission is accurate.",
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await run(submit ? "submit-project" : "save-project", {
        revision: data.project?.revision || 0,
        project: {
          ...project,
          ecosystemSelections: selectedSubmissionTools(
            project.ecosystemSelections ?? project.tools,
          ),
          contributions: undefined,
        },
      });
    } catch (e) {
      if (!(e instanceof ActionCancelled)) setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  if (data.submissionAccess?.canRead !== true)
    return (
      <p className="notice">This project is not available for your account.</p>
    );
  if (!data.team)
    return (
      <Empty>
        Create or join a team in <a href="/teams">Teams</a> first.
      </Empty>
    );
  return (
    <section className="submission-v6" data-readonly={!canCommit}>
      <header className="submission-wizard-header">
        <div className="submission-progress" aria-label={`Step ${step} of 3`}>
          <span className="submission-progress-bars" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <i key={n} data-active={n === step} />
            ))}
          </span>
          <span>{step} of 3</span>
        </div>
        <div className="submission-window-status">
          {(data.submissionStatus?.allowed === true || canCommit) && (
            <span>
              <i aria-hidden="true" />
              Submission window open
            </span>
          )}
          <small>
            {remaining} {remaining === 1 ? "submission" : "submissions"}{" "}
            remaining
          </small>
        </div>
        <div className="submission-heading">
          {step > 1 && canCommit ? (
            <button
              type="button"
              className="submission-back"
              aria-label="Previous submission step"
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : onExit ? (
            <button
              type="button"
              className="submission-back"
              aria-label={exitLabel}
              onClick={onExit}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <a
              className="submission-back"
              href="/dashboard#project"
              aria-label="Back to your project"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </a>
          )}
          <div>
            <HeadingDot color="blue" expression="squeezed" size={40} />
            <h1 ref={wizardHeading} tabIndex={-1}>
              Submit project
            </h1>
          </div>
          <span aria-hidden="true" />
        </div>
      </header>
      {data.eligibility?.status === "ineligible" && (
        <p className="notice">Ineligible · excluded from leaderboard</p>
      )}
      {data.submissionStatus && !data.submissionStatus.allowed && (
        <p className="notice">{data.submissionStatus.message}</p>
      )}
      <form
        className="project-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else void save(false);
        }}
      >
        <fieldset disabled={!canCommit || busy}>
          <legend className="sr-only">
            Step {step} of 3 · {remaining} submissions remaining
          </legend>
          <div
            className="submission-stage submission-essentials"
            data-step="1"
            hidden={step !== 1 && canCommit}
          >
            {[
              ["projectName", "Project name"],
              ["problemSolution", "One-line summary"],
              ["description", "Description"],
            ].map(([name, label]) => (
              <label key={name}>
                {label}{" "}
                <span className="required-marker" aria-hidden="true">
                  *
                </span>
                {name === "description" ? (
                  <textarea
                    name={name}
                    rows={5}
                    aria-required="true"
                    value={project[name]}
                    onChange={(e) => set(name, e.target.value)}
                  />
                ) : (
                  <input
                    name={name}
                    aria-required="true"
                    value={project[name]}
                    onChange={(e) => set(name, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
          <div
            className="submission-stage submission-integration"
            data-step="2"
            hidden={step !== 2 && canCommit}
          >
            <label>
              GitHub repository{" "}
              <span className="required-marker" aria-hidden="true">
                *
              </span>
              <span className="submission-icon-field">
                <img
                  src="/icons/social/github.svg"
                  width="20"
                  height="20"
                  alt=""
                />
                <input
                  name="github"
                  type="url"
                  aria-required="true"
                  value={project.github}
                  onChange={(e) => set("github", e.target.value)}
                />
              </span>
            </label>
            <label>
              Deployment URL
              <span className="submission-icon-field">
                <Link2 size={20} aria-hidden="true" />
                <input
                  name="demo"
                  type="url"
                  value={project.demo}
                  onChange={(e) => set("demo", e.target.value)}
                />
              </span>
            </label>
            <fieldset className="submission-tools">
              <legend>How have you integrated OpenAI ecosystem in it?</legend>
              <div className="submission-ecosystem-options">
                {submissionToolChoices.map((tool) => (
                  <label className="check-label" key={tool}>
                    <input
                      type="checkbox"
                      checked={selectedSubmissionTools(
                        project.ecosystemSelections ?? project.tools,
                      ).includes(tool)}
                      onChange={(e) => {
                        const selected = selectedSubmissionTools(
                          project.ecosystemSelections ?? project.tools,
                        );
                        const choices = e.target.checked
                          ? [...selected, tool]
                          : selected.filter((item) => item !== tool);
                        setProject((p: Row) => ({
                          ...p,
                          tools: choices.join("\n"),
                          ecosystemSelections: choices,
                        }));
                      }}
                    />
                    {tool}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="submission-tools submission-cerebras">
              <legend>
                Does {project.projectName?.trim() || "your project"} integrate
                Cerebras?
              </legend>
              <div>
                {(["yes", "no"] as const).map((answer) => (
                  <label
                    className="check-label"
                    key={answer}
                    data-selected={project.cerebrasIntegration === answer}
                  >
                    <input
                      type="radio"
                      name="cerebras-integration"
                      value={answer}
                      checked={project.cerebrasIntegration === answer}
                      onChange={() => set("cerebrasIntegration", answer)}
                    />
                    {answer === "yes" ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div
            className="submission-stage submission-media"
            data-step="3"
            hidden={step !== 3 && canCommit}
          >
            {(["logo", "banner"] as const).map((kind) => (
              <div
                className={`submission-upload submission-upload-${kind}`}
                key={kind}
              >
                <span className="submission-upload-label">
                  {kind === "logo" ? "Logo (1:1)" : "Banner (16:9)"}{" "}
                  <span className="required-marker" aria-hidden="true">
                    *
                  </span>
                </span>
                <div className="submission-upload-content">
                  {project[kind] && (
                    <img
                      className={`upload-preview ${kind}`}
                      src={project[kind]}
                      alt={`${kind} preview`}
                    />
                  )}
                  <div className="submission-upload-actions">
                    <label className="button secondary submission-file-button">
                      <Upload size={20} aria-hidden="true" />
                      <span>{project[kind] ? "Change" : `Upload ${kind}`}</span>
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg"
                        aria-label={`Upload ${kind}`}
                        onChange={(e) => {
                          void upload(e.target.files?.[0], kind);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {project[kind] && (
                      <button
                        type="button"
                        className="button secondary submission-remove-image"
                        aria-label={`Remove ${kind} image`}
                        onClick={() => set(kind, "")}
                      >
                        <Trash2 size={20} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <label className="check-label submission-attestation">
              <input
                type="checkbox"
                checked={!!project.attestation}
                onChange={(e) => set("attestation", e.target.checked)}
              />
              I confirm this submission is accurate.
            </label>
          </div>
          {canCommit && (
            <footer className="submission-actions">
              {step < 3 ? (
                <button
                  key="submission-next"
                  type="button"
                  className="button"
                  onClick={(event) => {
                    // This click replaces Next with a submit button. Cancel its
                    // native activation before changing the rendered step.
                    event.preventDefault();
                    next();
                  }}
                >
                  Next <ArrowRight size={20} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    className="button secondary"
                    disabled={busy}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      void save(true);
                    }}
                  >
                    Submit
                  </button>
                  <small className="submission-remaining">
                    {remaining} {remaining === 1 ? "submission" : "submissions"}{" "}
                    remaining
                  </small>
                </>
              )}
            </footer>
          )}
        </fieldset>
        {!canCommit && (
          <p className="notice">
            {data.submissionAccess?.message ||
              (attemptsUsed >= 3
                ? "All three commits are used. Your project is read-only."
                : "Your project is read-only. Editing requires the leader’s personal check-in and an open submission window.")}
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </form>
      {!onExit && (
        <div className="submission-history-actions">
          <ProjectHistory canRead={data.submissionAccess?.canRead === true} />
          {data.leaderboardUrl && (
            <a className="button secondary" href={data.leaderboardUrl}>
              View project <ExternalLink size={18} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
export function ProjectHistory({
  canRead,
  label = "View committed history",
}: {
  canRead: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || !canRead) return;
    const previous = document.activeElement as HTMLElement | null;
    const controller = new AbortController();
    dialog.current?.showModal();
    close.current?.focus();
    setBusy(true);
    setError("");
    setItems([]);
    void (async () => {
      try {
        const response = await fetch("/api/portal?view=%2Fproject-history", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const body = (await response.json()) as Row;
        if (!response.ok)
          throw new Error(body.message || "Project history could not load.");
        if (!Array.isArray(body.items) || body.items.length > 3)
          throw new Error("Project history is unavailable. Try again.");
        if (!controller.signal.aborted) setItems(body.items);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => {
      controller.abort();
      dialog.current?.close();
      previous?.isConnected && previous.focus({ preventScroll: true });
    };
  }, [open, canRead]);
  if (!canRead) return null;
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => setOpen(true)}
      >
        <Icon name="history" />
        {label}
      </button>
      {open && (
        <dialog
          className="project-history-dialog"
          onKeyDown={trapDialogFocus}
          ref={dialog}
          aria-labelledby="history-title"

          onCancel={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
        >
          <div className="section-heading">
            <h2 id="history-title">Committed history</h2>
            <button
              className="button secondary"
              type="button"
              ref={close}
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
              Close
            </button>
          </div>

          {busy && <p role="status">Loading committed history…</p>}
          {error && <p role="alert">{error}</p>}
          {!busy && !error && !items.length && (
            <p>No successful commits yet.</p>
          )}
          {items.map((item) => (
            <article className="history-version" key={item.id}>
              <h3>Version {item.attempt}</h3>
              <p>{ist(item.created_at)}</p>
              <ProjectVersion payload={item.payload} />
            </article>
          ))}
        </dialog>
      )}
    </>
  );
}
export function ProjectVersion({ payload }: { payload: Row }) {
  if (!payload || typeof payload !== "object")
    return <p>Version contents are unavailable.</p>;
  return (
    <>
      <h4>{payload.projectName}</h4>
      <p>{payload.problemSolution}</p>
      <p className="prose">{payload.description}</p>
      <p className="prose">{payload.tools}</p>
      {payload.cerebrasIntegration && (
        <p>Cerebras: {payload.cerebrasIntegration === "yes" ? "Yes" : "No"}</p>
      )}
      {[
        ["Repository", payload.github],
        ["Demo", payload.demo],
      ].map(
        ([label, url]) =>
          safeExternalUrl(url) && (
            <p key={label}>
              <a
                className="text-link"
                href={safeExternalUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {label}
              </a>
            </p>
          ),
      )}
    </>
  );
}
function ProjectBody({
  project,
  publicView = false,
}: {
  project: Row;
  publicView?: boolean;
}) {
  return (
    <>
      <img
        className="project-banner"
        src={project.banner}
        alt={`${project.projectName} project banner`}
      />
      <div className="project-identity">
        <img
          className="project-logo"
          src={project.logo}
          alt={`${project.projectName} logo`}
        />
        <div>
          <h1>{project.projectName}</h1>
          <p>
            {publicView ? "by " : "Team "}
            {project.teamName || "project team"}
          </p>
        </div>
      </div>
      <p className="project-description">{project.problemSolution}</p>
      <p className="prose">{project.description}</p>
      <div className="form-actions">
        {publicView && project.github && (
          <a
            className="button secondary"
            href={project.github}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="/icons/social/github.svg" width="20" height="20" alt="" />{" "}
            GitHub
          </a>
        )}
        {project.demo && (
          <a
            className={publicView ? "button secondary" : "button"}
            href={project.demo}
            target="_blank"
            rel="noopener noreferrer"
          >
            {publicView ? (
              <>
                <ExternalLink size={20} aria-hidden="true" /> Visit project
              </>
            ) : (
              "Open demo"
            )}
          </a>
        )}
        {!publicView && project.github && (
          <a
            className="button secondary"
            href={project.github}
            target="_blank"
            rel="noopener noreferrer"
          >
            Repository
          </a>
        )}
      </div>
    </>
  );
}
export class UpvoteController {
  pending = false;
  async commit(
    allowed: boolean,
    mutate: () => Promise<unknown>,
    optimistic: () => void,
    rollback: () => void,
  ) {
    if (!allowed || this.pending) return false;
    this.pending = true;
    optimistic();
    try {
      await mutate();
      return true;
    } catch (error) {
      rollback();
      throw error;
    } finally {
      this.pending = false;
    }
  }
}
export function UpvoteButton({
  project,
  canEngage,
  run,
}: {
  project: Row;
  canEngage: boolean;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [voted, setVoted] = useState(project.upvoted === true),
    [count, setCount] = useState<number | null>(
      Number.isFinite(project.upvotes) ? project.upvotes : null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<UpvoteController | null>(null);
  if (!controller.current) controller.current = new UpvoteController();
  useEffect(() => {
    setVoted(project.upvoted === true);
    setCount(Number.isFinite(project.upvotes) ? project.upvotes : null);
  }, [project.id, project.upvoted, project.upvotes]);
  const allowed = canEngage && project.canUpvote === true && !voted;
  return (
    <div className="vote-control">
      <button
        type="button"
        className="upvote-button"
        aria-label={`${voted ? "Upvoted" : "Upvote"} ${project.projectName}; ${count ?? "unknown"} upvotes`}
        aria-pressed={voted}
        aria-busy={busy}
        disabled={!allowed || busy}
        title={
          voted
            ? "You have upvoted this project"
            : !allowed
              ? "Voting is unavailable for your account"
              : "Upvote this project"
        }
        onClick={async () => {
          setError("");
          try {
            await controller.current!.commit(
              allowed,
              () => run("upvote-project", { projectId: project.id }),
              () => {
                setBusy(true);
                setVoted(true);
                if (count !== null) setCount(count + 1);
              },
              () => {
                setVoted(project.upvoted === true);
                setCount(
                  Number.isFinite(project.upvotes) ? project.upvotes : null,
                );
              },
            );
          } catch (e) {
            if (!(e instanceof ActionCancelled)) setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="up" size={18} />
        <span>{count ?? "?"}</span>
      </button>
      {error && (
        <small className="error-message" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
export function Projects({
  data,
  path,
  run,
}: {
  data: View;
  path: string;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(0),
    [listing, setListing] = useState<View>(data),
    [searchError, setSearchError] = useState(""),
    [comment, setComment] = useState(""),
    [commentBusy, setCommentBusy] = useState(false),
    [commentError, setCommentError] = useState("");
  const board = path === "/leaderboard",
    detail = path !== "/projects" && !board,
    p = data.items?.[0];
  const highlighted = useRef(false),
    commentPending = useRef(false);
  useEffect(() => {
    if (highlighted.current || !window.location.hash) return;
    const target = document.getElementById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "auto" });
      highlighted.current = true;
    }
  }, [listing]);

  useEffect(() => {
    if (detail) return;
    const controller = new AbortController();
    if (!q && !page) {
      setListing(data);
      if (data.page) setPage(data.page);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/portal?view=${encodeURIComponent(path)}&q=${encodeURIComponent(q)}&page=${page}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = (await r.json()) as View;
        if (!r.ok) throw new Error(String(body.message || "Search failed"));
        setListing(body);
        setSearchError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setSearchError((e as Error).message);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, page, data, path, detail]);
  const signIn = "/signin?returnTo=" + encodeURIComponent(path);
  const engagement = (p: Row) => (
    <div className="engagement">
      {data.me ? (
        <UpvoteButton
          project={p}
          canEngage={
            data.me.canEngage === true && !listing.engagement?.votingPaused
          }
          run={run}
        />
      ) : (
        <a
          className="upvote-button"
          href={signIn}
          target="_top"
          aria-label={`Sign in to upvote ${p.projectName}`}
        >
          <Icon name="up" size={18} />
          <span>{Number.isFinite(p.upvotes) ? p.upvotes : "?"}</span>
        </a>
      )}
      <a
        className="project-comments-button"
        href={`/projects/${p.slug}#comments`}
        aria-label={`${p.comments} ${p.comments === 1 ? "comment" : "comments"} on ${p.projectName}`}
      >
        <MessageSquare size={20} aria-hidden="true" />
        <span>{p.comments}</span>
      </a>
    </div>
  );
  if (detail && p)
    return (
      <section className="projects-v6 public-project-detail">
        <header className="project-detail-topline">
          <a
            className="back-link"
            href="/projects"
            aria-label="Back to Projects"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </a>
          <HeadingDot color="purple" expression="squeezed" size={40} />
          <strong>{p.teamName || p.projectName}</strong>
        </header>
        <article className="project-detail">
          <ProjectBody project={p} publicView />
          {p.result && (
            <p className="notice">
              Revealed {p.result.stage === "ai" ? "AI" : "final"} score{" "}
              {p.result.score}
            </p>
          )}
          {engagement(p)}
          {(p.engagementPaused ||
            data.engagement?.votingPaused ||
            data.engagement?.feedbackPaused) && (
            <p className="notice" role="status">
              Engagement paused. The hosts have paused{" "}
              {data.engagement?.votingPaused && data.engagement?.feedbackPaused
                ? "community voting and public feedback"
                : data.engagement?.feedbackPaused
                  ? "public feedback"
                  : data.engagement?.votingPaused
                    ? "community voting"
                    : "one or more community actions"}
              .
            </p>
          )}
          <section id="comments">
            <h2>Comments</h2>
            {(data.comments || []).map((c: Row) => (
              <article className="public-comment" key={c.id}>
                <DotAvatar
                  color={c.avatarColor || "blue"}
                  expression={c.avatarExpression || "squeezed"}
                  size={40}
                  decorative
                />
                <div className="public-comment-content">
                  <header>
                    <strong>{c.author}</strong>
                    <small>{ist(c.created_at)}</small>
                  </header>
                  <p>{c.body}</p>
                </div>
              </article>
            ))}
            {data.me?.canEngage === true &&
            p.canComment === true &&
            !data.engagement?.feedbackPaused ? (
              <form
                className="project-comment-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (commentPending.current || !comment.trim()) return;
                  commentPending.current = true;
                  setCommentBusy(true);
                  setCommentError("");
                  try {
                    await run("comment-project", {
                      projectId: p.id,
                      body: comment,
                    });
                    setComment("");
                  } catch (error) {
                    if (!(error instanceof ActionCancelled))
                      setCommentError((error as Error).message);
                  } finally {
                    commentPending.current = false;
                    setCommentBusy(false);
                  }
                }}
              >
                <DotAvatar
                  color={data.me.avatarColor || "blue"}
                  expression={data.me.avatarExpression || "squeezed"}
                  size={40}
                  decorative
                />
                <textarea
                  name="body"
                  aria-label="Public comment"
                  placeholder="Add a comment…"
                  rows={1}
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={commentBusy}
                />
                <button
                  className="project-send-comment"
                  type="submit"
                  aria-label="Post comment"
                  disabled={commentBusy || !comment.trim()}
                >
                  <Send size={20} aria-hidden="true" />
                </button>
                {commentError && <p role="alert">{commentError}</p>}
              </form>
            ) : data.me ? null : (
              <a className="button" href={signIn} target="_top">
                Sign in to comment
              </a>
            )}
          </section>
        </article>
      </section>
    );
  return (
    <section className="projects-v6 public-project-list">
      <header className="page-heading projects-heading">
        <HeadingDot color="purple" expression="squeezed" size={64} />
        <h1>{board ? "Leaderboard" : "Projects"}</h1>
      </header>
      <div className="project-search">
        <SearchIcon size={24} aria-hidden="true" />
        <Search
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
          }}
          label="Search projects"
        />
      </div>
      {(listing.engagement?.votingPaused ||
        listing.engagement?.feedbackPaused) && (
        <p className="notice" role="status">
          Engagement paused. Existing projects, votes and public feedback remain
          readable.
        </p>
      )}
      {board && (
        <p className="notice">
          {listing.scoreStage === "ai"
            ? "AI scores are public. Scored projects appear by score; tied scores follow first submission time."
            : listing.scoreStage === "final"
              ? listing.finalCountdownComplete
                ? "Final awards are revealed. Projects follow the final score order."
                : "Final awards are being unveiled one at a time. The ordinary project list stays in community order until every top-five award is unveiled."
              : "Eligible projects ordered by upvotes, then immutable first submission time."}
        </p>
      )}
      {board && listing.awards?.length > 0 && (
        <section className="panel" aria-label="Unveiled awards">
          <h2>Unveiled awards</h2>
          {listing.awards.map((a: Row) => (
            <p key={a.position}>
              <strong>
                {a.position} · {a.teamName}
              </strong>{" "}
              · <a href={`/projects/${a.slug}`}>{a.projectName}</a> · {a.score}
            </p>
          ))}
        </section>
      )}
      {listing.scoringInfo && (
        <details className="scoring-info">
          <summary>Info · calculation criteria and weightage</summary>
          <p>{listing.scoringInfo.criteria}</p>
          <p>{listing.scoringInfo.weightage}</p>
        </details>
      )}
      {searchError && <p role="alert">{searchError}</p>}
      <ul className="project-list">
        {(listing.items || [])
          .filter((p) =>
            (p.projectName + " " + p.teamName + " " + p.problemSolution)
              .toLowerCase()
              .includes(q.toLowerCase()),
          )
          .map((p) => (
            <li key={p.id} id={"entry-" + p.slug}>
              <a className="project-row-link" href={`/projects/${p.slug}`}>
                <img
                  loading="lazy"
                  decoding="async"
                  className="row-logo"
                  src={p.logo}
                  alt=""
                />
                <div>
                  <h2>{p.projectName}</h2>
                  <p>{p.problemSolution}</p>
                  <small>by {p.teamName}</small>
                </div>
              </a>
              {board ? (
                <div className="engagement">
                  <strong>
                    {p.result
                      ? `${p.result.score} ${p.result.stage === "ai" ? "AI" : "final"} score`
                      : `${p.upvotes} upvotes`}
                  </strong>
                  <a href={`/projects/${p.slug}`}>View project</a>
                </div>
              ) : (
                engagement(p)
              )}
            </li>
          ))}
      </ul>
      {!listing.items?.length && (
        <Empty>
          Eligible submitted projects will appear here automatically.
        </Empty>
      )}
      <div className="form-actions project-pagination">
        <button
          className="button secondary"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous page
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button secondary"
          disabled={!listing.hasMore}
          onClick={() => setPage(page + 1)}
        >
          Next page
        </button>
      </div>
    </section>
  );
}
export function adminParticipantProjection(
  row: Row,
): Row & { id: string; name: string; removed: boolean } {
  return {
    ...row,
    id: typeof row.id === "string" ? row.id : "",
    name: row.name || row.email || "Not signed in yet",
    teamId: row.teamId ?? row.team_id ?? null,
    teamName: row.teamName ?? row.team_name ?? null,
    teamLocked: row.teamLocked === true,
    teamLockedAt: row.teamLockedAt || null,
    removed: !!row.deactivated_at,
  };
}
export function adminProjectProjection(project: Row, suppliedVersions?: Row[]) {
  const versions = Array.isArray(suppliedVersions)
    ? suppliedVersions
    : Array.isArray(project.versions)
      ? project.versions
      : [];
  return {
    project: {
      id: project.id,
      name:
        project.projectName ||
        project.draft?.projectName ||
        project.name ||
        "Untitled draft",
      removed: !!project.deleted_at,
    },
    versions: versions
      .filter((v) => typeof v.id === "string" && v.id)
      .map((v) => ({
        id: v.id,
        label: Number.isInteger(v.attempt)
          ? `Version ${v.attempt}`
          : "Submission",
        removed: !!v.deleted_at,
      })),
  };
}
function AdminWorkspaceTabs({
  items,
  value,
  onChange,
  prefix,
  label,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  prefix: string;
  label: string;
}) {
  return (
    <div className="admin-workspace-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          id={`${prefix}-tab-${item.id}`}
          type="button"
          role="tab"
          aria-controls={`${prefix}-panel-${item.id}`}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : items.length - 1)) %
                    items.length;
            onChange(items[next].id);
            document.getElementById(`${prefix}-tab-${items[next].id}`)?.focus();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
export function AdminParticipants({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [filters, setFilters] = useState<AdminParticipantFiltersValue>({
      ...defaultAdminParticipantFilters,
      status: "all",
      team: "all",
    }),
    [recordState, setRecordState] = useState<ParticipantRecordState>("active"),
    [selected, setSelected] = useState<string[]>([]),
    [status, setStatus] = useState("pending"),
    [reason] = useState("Confirmed portal action"),
    [error, setError] = useState(""),
    [filtersExpanded, setFiltersExpanded] = useState(false),
    [adding, setAdding] = useState(false);
  const canManage = data.me?.owner === true || data.me?.role === "admin";
  const rows = (data.items || []).map(adminParticipantProjection);
  const items = filterAdminParticipants(rows, filters).filter(
    (r) =>
      recordState === "all" ||
      (recordState === "removed" ? r.removed : !r.removed),
  );
  const selectable = items.filter((r) => !r.removed);
  useEffect(() => {
    setSelected((previous) =>
      previous.filter((email) =>
        rows.some((r) => r.email === email && !r.removed),
      ),
    );
  }, [data.items]);
  const updateFilters = (value: AdminParticipantFiltersValue) => {
    setFilters(value);
    setSelected([]);
    setError("");
  };
  return (
    <section className="admin-exact admin-workspace admin-participants-page">
      <header className="page-heading admin-exact-heading">
        <h1>
          <HeadingDot color="orange" expression="sleepy" />
          Participants
        </h1>
        {canManage && (
          <div className="admin-heading-actions">
            <a
              className="button secondary"
              aria-label={`Export filtered participants (${items.length})`}
              href={participantExportHref(filters, recordState)}
            >
              <AdminIcon name="download" />
              Export
            </a>
            <button
              type="button"
              className="button"
              onClick={() => setAdding(true)}
            >
              <AdminIcon name="person" />
              Add participants
            </button>
          </div>
        )}
      </header>
      {canManage && adding && (
        <AdminImportDialog run={run} close={() => setAdding(false)} />
      )}
      <div className="admin-roster-tools">
        <AdminParticipantFilters
          value={filters}
          onChange={updateFilters}
          expanded={filtersExpanded}
        />
        <button
          type="button"
          className="admin-toolbar-icon admin-roster-filter-toggle"
          aria-label="Participant filters"
          aria-expanded={filtersExpanded}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <AdminIcon name="filter" />
        </button>
      </div>
      <div className="admin-result-bar">
        <span>
          {items.length} {items.length === 1 ? "participant" : "participants"}
        </span>
        <label className="admin-record-select">
          <span className="sr-only">Participation record</span>
          <select
            value={recordState}
            onChange={(event) => {
              setRecordState(event.target.value as ParticipantRecordState);
              setSelected([]);
              if (event.target.value === "removed")
                setFilters({ ...filters, status: "all", team: "all" });
            }}
          >
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="all">All records</option>
          </select>
        </label>
        {(filters.individual ||
          filters.status !== "all" ||
          filters.team !== "all" ||
          recordState !== "active") && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              updateFilters({
                ...defaultAdminParticipantFilters,
                status: "all",
                team: "all",
              });
              setRecordState("active");
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <strong>{selected.length} selected</strong>
          {canManage && (
            <label>
              <span className="sr-only">Individual approval status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="pending">Registered</option>
                <option value="approved">Going</option>
                <option value="checked">Checked in</option>
                <option value="absent">Absent</option>
              </select>
            </label>
          )}
          {canManage && (
            <button
              className="button secondary"
              disabled={!selected.length}
              onClick={() => {
                if (["checked", "absent"].includes(status)) {
                  const people = (data.items || []).filter((r) =>
                    selected.includes(r.email),
                  );
                  if (people.some((r) => !r.id)) {
                    setError(
                      "Selected people must sign in before a manual attendance status can be recorded.",
                    );
                    return;
                  }
                  void run("admin-status-bulk", {
                    userIds: people.map((r) => r.id),
                    status: status === "checked" ? "Checked in" : "Absent",
                    reason,
                  }).catch(() => {});
                } else
                  void run("participant-bulk", {
                    emails: selected,
                    status,
                    reason,
                  }).catch(() => {});
              }}
            >
              Update approval
            </button>
          )}
          <button
            className="button"
            disabled={!selected.length || !data.checkInConfigured}
            onClick={() => {
              void run("participant-bulk", {
                emails: selected,
                checkIn: true,
                reason,
              }).catch(() => {});
            }}
          >
            Check in
          </button>
        </div>
      )}

      <div className="table-scroll">
        <table className="participants-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select visible active participants"
                  disabled={!selectable.length}
                  checked={
                    !!selectable.length &&
                    selectable.every((r) => selected.includes(r.email))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? selectable.map((r) => r.email) : [],
                    )
                  }
                />
              </th>
              <th>Person</th>
              <th>Team</th>
              <th>Personal status</th>
              <th>Team status</th>
              <th>Locked at</th>
              {canManage && <th>Manage participant</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.email}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.email}`}
                    disabled={r.removed}
                    checked={selected.includes(r.email)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, r.email]
                          : selected.filter((x) => x !== r.email),
                      )
                    }
                  />
                </td>
                <td className="admin-person-cell">
                  <div className="admin-person-identity">
                    <DotAvatar
                      color={r.avatarColor || r.avatar_color || "blue"}
                      expression={
                        r.avatarExpression || r.avatar_expression || "squeezed"
                      }
                      size={32}
                      decorative
                    />
                    <div>
                      <strong>{r.name || "Not signed in yet"}</strong>
                      <small>{r.email}</small>
                      {r.removed && <Pill>Removed</Pill>}
                    </div>
                  </div>
                </td>
                <td className="admin-team-cell">
                  {r.teamName ? (
                    <div className="admin-team-identity">
                      <TeamAvatar
                        name={r.teamName}
                        palette={r.teamPalette}
                        size={32}
                      />
                      <div>
                        {r.teamName}
                        <small>
                          {r.teamReadiness?.total
                            ? `${r.teamReadiness.approved}/${r.teamReadiness.total} approved`
                            : ""}
                        </small>
                      </div>
                    </div>
                  ) : (
                    "Not in a team"
                  )}
                </td>
                <td className="admin-personal-status-cell">
                  <Pill
                    tone={
                      ["Going", "Checked in"].includes(r.status)
                        ? "positive"
                        : "neutral"
                    }
                  >
                    {r.status ||
                      (r.approval === "approved" ? "Going" : "Registered")}
                  </Pill>
                  {r.checked_in && r.status !== "Checked in" && (
                    <small>Checked in</small>
                  )}
                </td>
                <td
                  className="admin-team-status-cell"
                  data-empty-team={!r.teamId}
                >
                  <Pill
                    tone={r.teamStatus === "Submitted" ? "positive" : "neutral"}
                  >
                    {r.teamStatus ||
                      (r.teamId
                        ? r.teamLocked
                          ? "Locked"
                          : "Forming"
                        : "Not in a team")}
                  </Pill>
                </td>
                <td className="admin-locked-at">
                  {r.teamLockedAt ? (
                    <time dateTime={r.teamLockedAt}>{ist(r.teamLockedAt)}</time>
                  ) : (
                    <span className="admin-not-locked">Not locked</span>
                  )}
                </td>
                {canManage && (
                  <td className="admin-manage-cell">
                    {r.id ? (
                      <div className="admin-row-actions">
                        <StatusChange
                          kind="person"
                          target={r.id}
                          name={r.name || r.email}
                          current={r.status}
                          run={run}
                          compact
                          disabled={r.removed}
                        >
                          <AdminParticipantActions
                            key={`${r.id}-${r.removed}`}
                            participant={{
                              id: r.id,
                              name: r.name,
                              email: r.email,
                              removed: r.removed,
                            }}
                            run={run}
                            compact
                          />
                        </StatusChange>
                      </div>
                    ) : (
                      <span className="muted">
                        Account has not signed in yet.
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {!items.length && <Empty>No participants match your filters.</Empty>}
    </section>
  );
}
export function privateReviewValues(
  form: FormData,
  kind: string,
  projectId: string,
  versionId: string | undefined,
) {
  if (!versionId)
    throw new Error(
      "A committed version is required before a review can be saved.",
    );
  const body = String(form.get("body") || "").trim();
  const supplied = String(form.get("rating") || "").trim();
  const canScore = kind === "admin" || kind === "judge";
  const rating = canScore && supplied ? Number(supplied) : undefined;
  if (
    rating !== undefined &&
    (!Number.isFinite(rating) || rating < 1 || rating > 10)
  )
    throw new Error("Enter a private score from 1 to 10.");
  if (!body && rating === undefined)
    throw new Error(
      canScore
        ? "Add a private score or written feedback."
        : "Add your written feedback.",
    );
  return {
    projectId,
    versionId,
    ...(body ? { body } : {}),
    ...(rating !== undefined ? { rating } : {}),
  };
}
export function Review({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [reviewTab, setReviewTab] = useState("review");
  const p = data.project,
    v = data.version;
  if (!p) return <Empty>Select a submitted project.</Empty>;
  const selectReviewTab = (value: string, focus = false) => {
    setReviewTab(value);
    if (focus)
      document
        .getElementById(
          value === "details"
            ? "admin-project-details-tab"
            : "admin-project-review-tab",
        )
        ?.focus();
  };
  const reviewTabKey = (event: { key: string; preventDefault: () => void }) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    selectReviewTab(
      event.key === "Home"
        ? "details"
        : event.key === "End"
          ? "review"
          : reviewTab === "details"
            ? "review"
            : "details",
      true,
    );
  };
  const payload = v?.payload || p.draft;
  const ownReview = (data.history || []).find(
    (item: Row) =>
      item.author_id === data.me?.id &&
      item.version_id === v?.id &&
      item.rating != null,
  );
  const versionRows: Row[] = data.versions || (v ? [v] : []);
  return (
    <section
      className="admin-exact admin-workspace admin-review-page"
      data-review-tab={reviewTab}
    >
      <header className="admin-review-header">
        <a
          className="back-link"
          href={
            data.me?.owner || data.me?.role === "admin"
              ? "/admin/submissions"
              : "/review"
          }
        >
          <ArrowLeft size={20} aria-hidden="true" /> Submissions
        </a>
        <div className="admin-review-identity">
          {p.teamName ? (
            <TeamAvatar name={p.teamName} palette={p.teamPalette} size={40} />
          ) : payload.logo ? (
            <img src={payload.logo} alt="" width={40} height={40} />
          ) : null}
          <strong>
            {p.teamName || payload.projectName || "Project review"}
          </strong>
        </div>
      </header>
      <div
        className="admin-review-tabs"
        role="tablist"
        aria-label="Project review"
      >
        <button
          type="button"
          role="tab"
          id="admin-project-details-tab"
          aria-selected={reviewTab === "details"}
          aria-controls="admin-project-details"
          tabIndex={reviewTab === "details" ? 0 : -1}
          onKeyDown={reviewTabKey}
          onClick={() => selectReviewTab("details")}
        >
          Project details
        </button>
        <button
          type="button"
          role="tab"
          id="admin-project-review-tab"
          aria-selected={reviewTab === "review"}
          aria-controls="admin-project-review"
          tabIndex={reviewTab === "review" ? 0 : -1}
          onKeyDown={reviewTabKey}
          onClick={() => selectReviewTab("review")}
        >
          Review
        </button>
      </div>
      <div className="review-layout">
        <article
          id="admin-project-details"
          aria-labelledby="admin-project-details-tab"
        >
          {payload.logo && payload.banner ? (
            <ProjectBody project={payload} />
          ) : (
            <>
              <h1>{payload.projectName || "Untitled draft"}</h1>
              <p>Required project media is not complete.</p>
            </>
          )}

          {(data.me?.owner || data.me?.role === "admin") && (
            <details className="panel">
              <summary>Manage project and submission versions</summary>
              <AdminProjectActions
                key={`${p.id}-${p.deleted_at || "active"}-${JSON.stringify(data.versions || p.versions || [])}`}
                {...adminProjectProjection(p, data.versions)}
                run={run}
              />
            </details>
          )}
          {(data.me?.owner || data.me?.role === "admin") && v && (
            <details className="panel">
              <summary>Final judging rubric · reviewer private</summary>
              {data.scoringReady !== true && (
                <p className="notice">
                  Judging setup is pending. Rubric scoring is inactive until the
                  server confirms readiness.
                </p>
              )}
              <Form
                title="Record verified rubric evidence"
                disabled={data.scoringReady !== true}
                onSave={async (f) => {
                  await run("review", {
                    teamId: p.team_id,
                    versionId: v.id,
                    eligibility:
                      data.eligibility.status === "ineligible"
                        ? "ineligible"
                        : data.eligibility.status === "eligible"
                          ? "eligible"
                          : "needs_review",
                    astra: Number(f.get("astra")),
                    codex: Number(f.get("codex")),
                    diversity: Number(f.get("diversity")),
                    falseClaims: Number(f.get("falseClaims")),
                    evidence: f.get("evidence"),
                    reason: f.get("reason"),
                  });
                }}
              >
                {[
                  ["astra", "Technical rubric · 0–30"],
                  ["codex", "Codex evidence · 0–5"],
                  ["diversity", "Collaboration rubric · 0–10"],
                  ["falseClaims", "Approved false-claim findings · 0–2"],
                ].map(([name, label]) => (
                  <Field
                    key={name}
                    name={name}
                    type="number"
                    label={label}
                    required
                    value={
                      data.rubricReview?.[
                        name === "falseClaims" ? "false_claims" : name
                      ] ?? ""
                    }
                  />
                ))}
                <Field
                  name="evidence"
                  label="Verified evidence and review rationale"
                  type="textarea"
                  required
                  value={data.rubricReview?.evidence || ""}
                />
                <Field
                  name="reason"
                  label="Change reason"
                  required
                  minLength={5}
                />
              </Form>
            </details>
          )}
          {(data.me?.owner ||
            data.me?.role === "admin" ||
            data.canRestoreEligibility) &&
            v && (
              <Form
                className="panel"
                title="Eligibility check"
                label="Record eligibility"
                onSave={async (f) => {
                  await run("set-project-eligibility", {
                    projectId: p.id,
                    versionId: v.id,
                    status: f.get("status"),
                    reason: f.get("reason"),
                    ...(f.get("status") === "ineligible"
                      ? {
                          violation: {
                            rule: f.get("rule"),
                            evidence: f.get("evidence"),
                          },
                        }
                      : {}),
                  });
                }}
              >
                <Field
                  name="rule"
                  label="Confirmed rule (required for Ineligible)"
                />
                <Field
                  name="evidence"
                  label="Private evidence (required for Ineligible)"
                  type="textarea"
                />

                <Field name="status" label="Eligibility">
                  <select
                    name="status"
                    defaultValue={data.eligibility?.status || "needs_review"}
                  >
                    <option value="needs_review">Checks pending</option>
                    <option value="eligible">Eligible</option>
                    <option value="ineligible">Ineligible</option>
                  </select>
                </Field>
                <Field
                  name="reason"
                  label="Verified evidence or reason"
                  required
                  minLength={5}
                />
              </Form>
            )}
        </article>
        <aside
          id="admin-project-review"
          aria-labelledby="admin-project-review-tab"
        >
          <Form
            key={`${p.id}-${v?.id || "draft"}`}
            className="panel admin-review-score"
            title={
              data.reviewKind === "mentor" ? "Private advice" : "Your score"
            }
            label={data.reviewKind === "mentor" ? "Save advice" : "Save score"}
            onSave={async (f) => {
              await run(
                "review-project",
                privateReviewValues(f, data.reviewKind, p.id, v?.id),
              );
            }}
            disabled={!v}
          >
            {["admin", "judge"].includes(data.reviewKind) && (
              <fieldset className="admin-review-score-picker">
                <legend>Score (1 to 10)</legend>
                {Array.from({ length: 10 }, (_, index) => index + 1).map(
                  (rating) => (
                    <label key={rating}>
                      <input
                        type="radio"
                        name="rating"
                        value={rating}
                        defaultChecked={Number(ownReview?.rating) === rating}
                      />
                      <span>{rating}</span>
                    </label>
                  ),
                )}
              </fieldset>
            )}
            <Field
              name="body"
              label={
                ["admin", "judge"].includes(data.reviewKind)
                  ? "Private feedback"
                  : "Feedback for the team"
              }
              type="textarea"
              required={!["admin", "judge"].includes(data.reviewKind)}
            />

            {!v && (
              <p className="notice">
                A committed version is required before a review can be saved.
              </p>
            )}
          </Form>

          {(data.me?.owner || data.me?.role === "admin") && (
            <section className="panel admin-review-ai">
              <h2>AI evaluation</h2>
              <Pill>
                {data.evaluationConfigured ? "Configured" : "Not configured"}
              </Pill>

              <button
                className="button secondary"
                disabled={
                  !data.evaluationConfigured ||
                  data.scoringReady !== true ||
                  !v ||
                  (data.runs || []).some((r: Row) =>
                    ["queued", "running"].includes(r.state),
                  )
                }
                onClick={() => {
                  void run("reevaluate-project", {
                    projectId: p.id,
                    versionId: v?.id,
                  }).catch(() => {});
                }}
              >
                Re-evaluate
              </button>
              {(data.runs || []).map((r: Row) => (
                <p key={r.id}>
                  {r.state} · {ist(r.created_at)}
                  {r.error && <small>{r.error}</small>}
                </p>
              ))}
            </section>
          )}
          <details className="panel admin-review-versions" open>
            <summary>
              <span>Versions</span>
              <span>
                {versionRows.length
                  ? Math.max(
                      ...versionRows.map((item) => Number(item.attempt) || 0),
                    )
                  : 0}{" "}
                / 3
              </span>
            </summary>
            <ul>
              {versionRows.map((item) => (
                <li key={item.id}>
                  <strong>v{item.attempt}</strong>
                  <span>
                    {item.deleted_at ? "Removed" : "Committed"}
                    {item.created_at ? ` · ${ist(item.created_at)}` : ""}
                  </span>
                  {item.id === v?.id && !item.deleted_at && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setReviewTab("details")}
                    >
                      View
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <details className="panel">
            <summary>Review history · unrevealed</summary>
            {(data.history || []).map((h: Row) => (
              <article className="feedback-entry" key={h.id}>
                <strong>
                  {h.author} · {h.kind}
                </strong>
                {h.rating !== undefined && h.rating !== null && (
                  <Pill>Score {h.rating}</Pill>
                )}
                <p>{h.body}</p>
                <small>{ist(h.created_at)}</small>
              </article>
            ))}
          </details>
          {(data.me?.owner || data.me?.role === "admin") && (
            <Form
              title="Assign a reviewer"
              onSave={async (f) => {
                const reviewer = (data.reviewers || []).find(
                  (r: Row) => r.id === f.get("userId"),
                );
                if (!reviewer) throw new Error("Choose a reviewer.");
                await run("assign-project", {
                  projectId: p.id,
                  userId: reviewer.id,
                  kind: reviewer.role,
                  reason: f.get("reason"),
                });
              }}
            >
              <Field name="userId" label="Assigned judge or mentor">
                <select name="userId" required>
                  <option value="">Choose a person</option>
                  {(data.reviewers || []).map((r: Row) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.role}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                name="reason"
                label="Assignment reason"
                required
                minLength={5}
              />
            </Form>
          )}
        </aside>
      </div>
    </section>
  );
}
export function AdminList({
  data,
  path,
  run,
}: {
  data: View;
  path: string;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [lockFilter, setLockFilter] = useState(""),
    [filtersExpanded, setFiltersExpanded] = useState(false);
  const teams = path === "/admin/teams",
    logs = path === "/admin/logs",
    credits = path === "/admin/credits";
  const items = (data.items || []).filter(
    (r) =>
      JSON.stringify(r).toLowerCase().includes(q.toLowerCase()) &&
      (!filter || r.status === filter) &&
      (!lockFilter || (lockFilter === "locked" ? r.locked : !r.locked)),
  );
  const logActions = [
    ...new Set(
      (data.items || []).map((row) => String(row.action || "")).filter(Boolean),
    ),
  ].sort();
  const exportHref = `/api/export?list=${logs ? "logs" : teams ? "teams" : credits ? "credits" : "submissions"}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&lock=${encodeURIComponent(lockFilter)}`;
  return (
    <section
      className={`admin-exact admin-workspace admin-list-page${teams ? " admin-teams-page" : logs ? " admin-logs-page" : credits ? " admin-credits-page" : " admin-submissions-page"}`}
    >
      <header className="page-heading admin-exact-heading">
        <h1>
          <HeadingDot
            color={logs ? "grey" : teams || credits ? "green" : "purple"}
            expression={
              logs || credits ? "cheerful" : teams ? "squeezed" : "plus"
            }
          />
          {logs
            ? "Logs"
            : teams
              ? "Teams"
              : credits
                ? "Credits"
                : "Submissions"}
        </h1>
      </header>
      <div
        className={`toolbar admin-list-toolbar${filtersExpanded ? " is-expanded" : ""}`}
      >
        <Search
          value={q}
          onChange={setQ}
          label={
            teams
              ? "Search teams"
              : logs
                ? "Search logs"
                : credits
                  ? "Search credits"
                  : "Search projects"
          }
        />
        {!credits && (
          <button
            className="admin-toolbar-icon admin-mobile-filter"
            aria-label={
              teams
                ? "Team filters"
                : logs
                  ? "Log filters"
                  : "Submission filters"
            }
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <AdminIcon name="filter" />
          </button>
        )}
        {!logs && !credits && (
          <select
            aria-label={teams ? "Team lock status" : "Submission status"}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {(teams
              ? ["Forming", "Locked", "Not submitted", "Submitted"]
              : ["Draft", "Submitted"]
            ).map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        )}
        {teams && (
          <select
            aria-label="Membership lock filter"
            value={lockFilter}
            onChange={(e) => setLockFilter(e.target.value)}
          >
            <option value="">Lock: all</option>
            <option value="locked">Locked</option>
            <option value="unlocked">Unlocked</option>
          </select>
        )}
        {logs && (
          <select
            aria-label="Log action"
            value={logActions.includes(q) ? q : ""}
            onChange={(e) => setQ(e.target.value)}
          >
            <option value="">All actions</option>
            {logActions.map((action) => (
              <option key={action} value={action}>
                {action.replace(/[-_]/g, " ")}
              </option>
            ))}
          </select>
        )}
        {teams && (
          <a
            className="button secondary admin-member-export"
            aria-label="Export member emails"
            href={`/api/export?list=team-emails&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&lock=${encodeURIComponent(lockFilter)}`}
          >
            <AdminIcon name="users" />
            <span className="admin-export-label">Member emails</span>
          </a>
        )}
        {path !== "/review" && (
          <a
            className="button secondary admin-main-export"
            aria-label="Export CSV"
            href={exportHref}
          >
            <AdminIcon name="download" />
            <span className="admin-export-label">Export</span>
          </a>
        )}
      </div>
      {credits ? (
        <>
          <AdminCreditBatches batches={data.creditBatches || []} run={run} />
          <div className="table-scroll admin-credit-inventory">
            <table className="admin-credits-table">
              <thead>
                <tr>
                  <th>Credit</th>
                  <th>Status</th>
                  <th>Inventory</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
                {items.map((credit) => (
                  <tr key={credit.id}>
                    <td className="credit-identity">
                      <AdminIcon name="ticket" />
                      <strong>{credit.name}</strong>
                    </td>
                    <td className="credit-state">
                      <Pill tone={credit.active ? "positive" : "neutral"}>
                        {credit.active ? "Active" : "Inactive"}
                      </Pill>
                    </td>
                    <td className="credit-metric">
                      <span className="credit-metric-label">Inventory</span>
                      <strong>{credit.inventory}</strong>
                    </td>
                    <td className="credit-metric">
                      <span className="credit-metric-label">Assigned</span>
                      <strong>{credit.assigned}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : teams ? (
        <ul className="admin-team-list">
          {items.map((team) => (
            <li key={team.id}>
              <details
                className="admin-team-disclosure"
                open={Boolean(team.locked)}
              >
                <summary>
                  <TeamAvatar
                    name={team.name}
                    palette={team.palette}
                    size={48}
                  />
                  <div>
                    <strong>{team.name}</strong>
                    <small>
                      {team.status} ·{" "}
                      {team.readiness?.total
                        ? `${team.readiness.approved}/${team.readiness.total} approved`
                        : `${team.members.length} members`}
                    </small>
                  </div>
                  <ChevronDown size={20} aria-hidden="true" />
                </summary>
                <div className="admin-team-management">
                  <StatusChange
                    kind="team"
                    target={team.id}
                    name={team.name}
                    current={team.status}
                    run={run}
                    compact
                  />
                </div>
                <ul className="member-list">
                  {team.members.map((member: Row) => (
                    <li key={member.id}>
                      <DotAvatar
                        color={member.avatarColor}
                        expression={member.avatarExpression}
                        size={36}
                        decorative
                      />
                      <div>
                        <strong>{member.name}</strong>
                      </div>
                      <Pill
                        tone={
                          ["Going", "Checked in"].includes(
                            member.status ||
                              (member.approval === "approved"
                                ? "Going"
                                : "Registered"),
                          )
                            ? "positive"
                            : "neutral"
                        }
                      >
                        {member.status ||
                          (member.approval === "approved"
                            ? "Going"
                            : "Registered")}
                      </Pill>
                      <AdminLeaderTransfer
                        team={
                          team as {
                            id: string;
                            name: string;
                            leader_id: string;
                          }
                        }
                        member={
                          member as {
                            id: string;
                            name: string;
                            removed?: boolean;
                          }
                        }
                        canTransfer={Boolean(
                          data.me?.owner || data.me?.role === "admin",
                        )}
                        run={run}
                      />
                      {member.id !== team.leader_id && (
                        <button
                          className="admin-toolbar-icon admin-icon-danger"
                          aria-label={`Remove ${member.name || member.email} from ${team.name}`}
                          title={`Remove ${member.name || member.email} (${member.email})`}
                          onClick={() => {
                            void run("remove-workspace-member", {
                              userId: member.id,
                              reason: "Administrator updated team membership",
                            }).catch(() => {});
                          }}
                        >
                          <AdminIcon name="trash" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      ) : logs ? (
        <ul className="admin-log-list">
          {items.map((record) => (
            <li key={record.id}>
              <details>
                <summary>
                  <span className="admin-log-actor">
                    <DotAvatar
                      color={record.avatarColor}
                      expression={record.avatarExpression}
                      size={36}
                      decorative
                    />
                  </span>
                  <div>
                    <strong>
                      {record.actorName || record.actor_id || "System"}
                    </strong>
                    <span>
                      {String(record.action || "").replace(/[-_]/g, " ")}
                    </span>
                    <time dateTime={record.created_at}>
                      {ist(record.created_at)}
                    </time>
                  </div>
                  <ChevronRight size={20} aria-hidden="true" />
                </summary>
                <dl>
                  <dt>Reason</dt>
                  <dd>{record.reason || "None"}</dd>
                  <dt>Change summary</dt>
                  <dd className="log-detail">{record.detail}</dd>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="submission-list admin-submission-records">
          {items.map((record) => (
            <li key={record.id}>
              <a
                href={`${path === "/review" ? "/review" : "/admin/submissions"}/${record.slug}`}
              >
                <TeamAvatar
                  name={record.teamName || record.projectName}
                  palette={record.teamPalette}
                  size={48}
                />
                <div>
                  <h2>
                    {record.teamName || record.projectName || "Untitled draft"}
                  </h2>
                  <p>{record.projectName || "Untitled draft"}</p>
                  <small>
                    {record.status}
                    {record.versions?.length
                      ? ` · Version ${Math.max(...record.versions.map((version: Row) => Number(version.attempt) || 0))} of 3`
                      : ""}
                  </small>
                </div>
                <ChevronRight size={20} aria-hidden="true" />
                <span className="sr-only">Review project</span>
              </a>
              {path === "/admin/submissions" &&
                (data.me?.owner || data.me?.role === "admin") && (
                  <details className="panel admin-submission-management">
                    <summary>
                      {record.deleted_at
                        ? "Removed project · manage restoration"
                        : "Manage project and submissions"}
                    </summary>
                    <AdminProjectActions
                      key={`${record.id}-${record.deleted_at || "active"}-${JSON.stringify(record.versions || [])}`}
                      {...adminProjectProjection(record)}
                      run={run}
                    />
                  </details>
                )}
            </li>
          ))}
        </ul>
      )}
      {!items.length && (
        <p className="admin-empty-state" role="status">
          {teams
            ? "No teams match this view."
            : logs
              ? "No activity recorded yet."
              : credits
                ? "No credits match this view."
                : "No submissions match this view."}
        </p>
      )}
    </section>
  );
}
export function ContentEditor({
  data,
  run,
  scope,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
  scope: "public" | "private";
}) {
  const record = scope === "public" ? data.content : data.venue;
  const initial = JSON.parse(record?.draft || "{}");
  const [content, setContent] = useState<Row>(initial),
    [busy, setBusy] = useState<"save" | "publish" | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [removal, setRemoval] = useState<{
      collection: "agenda" | "faqs";
      index: number;
      target: string;
    } | null>(null);
  const [contentTab, setContentTab] = useState("agenda");
  const contentId = useId();
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const update = (k: string, v: unknown) => {
    setContent((p) => ({ ...p, [k]: v }));
    setError("");
  };
  const persist = async (action: "content-save" | "content-publish") => {
    if (busy) return;
    setBusy(action === "content-save" ? "save" : "publish");
    setStatus(action === "content-save" ? "Saving draft…" : "Publishing…");
    setError("");
    try {
      await run(action, {
        scope,
        revision: record?.revision || 0,
        ...(action === "content-save" ? { content } : {}),
        reason:
          action === "content-save"
            ? "Owner updated the event content draft"
            : "Owner published the saved content draft",
      });
      setStatus(
        action === "content-save" ? "Draft saved." : "Draft published.",
      );
    } catch (cause) {
      if (cause instanceof ActionCancelled) setStatus("Cancelled.");
      else {
        setStatus("");
        setError((cause as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {removal && (
        <ConfirmationDialog
          value={{
            title:
              removal.collection === "agenda"
                ? "Remove agenda entry?"
                : "Remove question?",
            target: removal.target,
            description:
              "Remove this item from the draft. Save the draft to keep the change.",
            confirmLabel:
              removal.collection === "agenda"
                ? "Remove entry"
                : "Remove question",
            critical: true,
          }}
          decide={(confirmed) => {
            if (confirmed) {
              update(
                removal.collection,
                content[removal.collection].filter(
                  (_: Row, index: number) => index !== removal.index,
                ),
              );
              setStatus(
                removal.collection === "agenda"
                  ? "Agenda entry removed."
                  : "Question removed.",
              );
            } else setStatus("Removal cancelled.");
            setRemoval(null);
          }}
        />
      )}
      <form
        className="panel admin-content-editor"
        aria-busy={!!busy}
        onSubmit={(event) => {
          event.preventDefault();
          void persist("content-save");
        }}
      >
        <h2>
          {scope === "public"
            ? "Public event content"
            : "Private arrival details"}
        </h2>
        <fieldset
          disabled={!!busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          {scope === "public" ? (
            <>
              <AdminWorkspaceTabs
                items={[
                  { id: "agenda", label: "Agenda" },
                  { id: "faqs", label: "FAQ" },
                  { id: "rules", label: "Rules" },
                ]}
                value={contentTab}
                onChange={setContentTab}
                prefix={contentId}
                label="Event content"
              />
              <section
                id={`${contentId}-panel-agenda`}
                role="tabpanel"
                aria-labelledby={`${contentId}-tab-agenda`}
                hidden={contentTab !== "agenda"}
                className="admin-content-panel"
              >
                {(content.agenda || []).map((entry: Row, index: number) => (
                  <details
                    key={index}
                    className="admin-content-entry"
                    open={index === 0}
                  >
                    <summary>
                      <span className="admin-entry-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{entry.title || "Untitled entry"}</strong>
                      <ChevronDown size={18} aria-hidden="true" />
                    </summary>
                    <div className="admin-content-entry-fields">
                      {["time", "title", "description"].map((key) => (
                        <label key={key}>
                          {key[0].toUpperCase() + key.slice(1)}
                          <input
                            value={entry[key]}
                            onChange={(event) =>
                              update(
                                "agenda",
                                content.agenda.map((row: Row, i: number) =>
                                  i === index
                                    ? { ...row, [key]: event.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`Remove agenda entry ${index + 1}: ${entry.title || "Untitled"}`}
                        onClick={() =>
                          setRemoval({
                            collection: "agenda",
                            index,
                            target: `Agenda entry ${index + 1}: ${entry.title || "Untitled"}`,
                          })
                        }
                      >
                        <Trash2
                          size={18}
                          aria-hidden="true"
                          focusable="false"
                        />{" "}
                        Remove
                      </button>
                    </div>
                  </details>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    update("agenda", [
                      ...(content.agenda || []),
                      { time: "", title: "", description: "" },
                    ]);
                    setStatus("Agenda entry added.");
                  }}
                >
                  <Plus size={18} aria-hidden="true" focusable="false" /> Add
                  agenda entry
                </button>
              </section>
              <section
                id={`${contentId}-panel-faqs`}
                role="tabpanel"
                aria-labelledby={`${contentId}-tab-faqs`}
                hidden={contentTab !== "faqs"}
                className="admin-content-panel"
              >
                {(content.faqs || []).map((entry: Row, index: number) => (
                  <details
                    key={index}
                    className="admin-content-entry"
                    open={index === 0}
                  >
                    <summary>
                      <span className="admin-entry-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{entry.question || "Untitled question"}</strong>
                      <ChevronDown size={18} aria-hidden="true" />
                    </summary>
                    <div className="admin-content-entry-fields">
                      {["question", "answer"].map((key) => (
                        <label key={key}>
                          {key[0].toUpperCase() + key.slice(1)}
                          <textarea
                            value={entry[key]}
                            onChange={(event) =>
                              update(
                                "faqs",
                                content.faqs.map((row: Row, i: number) =>
                                  i === index
                                    ? { ...row, [key]: event.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`Remove question ${index + 1}: ${entry.question || "Untitled"}`}
                        onClick={() =>
                          setRemoval({
                            collection: "faqs",
                            index,
                            target: `Question ${index + 1}: ${entry.question || "Untitled"}`,
                          })
                        }
                      >
                        <Trash2
                          size={18}
                          aria-hidden="true"
                          focusable="false"
                        />{" "}
                        Remove
                      </button>
                    </div>
                  </details>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    update("faqs", [
                      ...(content.faqs || []),
                      { question: "", answer: "" },
                    ]);
                    setStatus("Question added.");
                  }}
                >
                  <Plus size={18} aria-hidden="true" focusable="false" /> Add
                  question
                </button>
              </section>
              <section
                id={`${contentId}-panel-rules`}
                role="tabpanel"
                aria-labelledby={`${contentId}-tab-rules`}
                hidden={contentTab !== "rules"}
                className="admin-content-panel"
              >
                <label>
                  <span className="sr-only">Rules</span>
                  <textarea
                    rows={7}
                    value={content.rules || ""}
                    onChange={(event) => update("rules", event.target.value)}
                  />
                </label>
              </section>
            </>
          ) : (
            <>
              {[
                ["location", "Exact room or entry location"],
                ["directions", "Private directions"],
                ["mapUrl", "Private Google Maps URL"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  {key === "directions" ? (
                    <textarea
                      value={content[key] || ""}
                      onChange={(event) => update(key, event.target.value)}
                    />
                  ) : (
                    <input
                      type={key === "mapUrl" ? "url" : "text"}
                      value={content[key] || ""}
                      onChange={(event) => update(key, event.target.value)}
                    />
                  )}
                </label>
              ))}
            </>
          )}
          <div className="form-actions">
            <button
              type="submit"
              className="button"
              disabled={!!busy || (!dirty && !!record?.revision)}
            >
              <SaveIcon size={18} aria-hidden="true" focusable="false" />
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!!busy || dirty || !record?.revision}
              onClick={() => {
                void persist("content-publish");
              }}
            >
              <Send size={18} aria-hidden="true" focusable="false" />
              {busy === "publish" ? "Publishing…" : "Publish saved draft"}
            </button>
          </div>
        </fieldset>
        <p role="status" aria-live="polite">
          {status}
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </form>
    </>
  );
}
function OwnerPolicyControls({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [preview, setPreview] = useState<Row | null>(null),
    [error, setError] = useState("");
  const weights = data.policy?.weights || {};
  return (
    <section className="panel">
      <h2>Scoring weights</h2>

      <Form
        disabled={data.readiness?.scoring?.ready !== true}
        label="Preview global weights"
        onSave={async (f) => {
          setError("");
          const values = {
            version: data.policyVersion,
            weights: Object.fromEntries(
              Object.keys(weights).map((k) => [k, Number(f.get(k))]),
            ),
          };
          const result = await api("preview-policy-weights", values);
          setPreview({
            kind: "weights",
            values: { ...values, reason: f.get("reason") },
            ...result,
          });
        }}
      >
        {Object.entries(weights).map(([key, value]) => (
          <Field
            key={key}
            name={key}
            type="number"
            label={
              (
                {
                  human: "Human review",
                  ai: "AI evaluation",
                  votes: "Votes",
                  diversity: "Collaboration",
                  codex: "Codex",
                  feedback: "Feedback",
                } as Record<string, string>
              )[key] || key
            }
            value={value}
            required
          />
        ))}
        <Field name="reason" label="Reason" required minLength={5} />
      </Form>
      {preview && (
        <div className="policy-preview" role="status">
          <h3>Preview · not published</h3>
          <p>
            All teams:
            <strong>{preview.label}</strong>
          </p>
          {(preview.warnings || []).map((warning: string) => (
            <p role="alert" key={warning}>
              {warning}
            </p>
          ))}

          <button
            className="button"
            onClick={() => {
              void run("publish-policy-weights", {
                ...preview.values,
                preview: preview.preview,
              })
                .then(() => setPreview(null))
                .catch((e) => {
                  if (!(e instanceof ActionCancelled)) setError(e.message);
                });
            }}
          >
            Review and publish global weights
          </button>
          <button className="button secondary" onClick={() => setPreview(null)}>
            Discard preview
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function AdminEngagementControls({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  if (!(data.me?.owner || data.me?.role === "admin")) return null;
  const settings = data.engagement;
  if (
    !settings ||
    !Number.isInteger(settings.version) ||
    typeof settings.votingPaused !== "boolean" ||
    typeof settings.feedbackPaused !== "boolean"
  )
    return (
      <section className="admin-settings-section admin-settings-engagement">
        <h2>Voting and public comments</h2>
        <p className="control-feedback" role="status">
          Voting settings could not load. Refresh this page.
        </p>
      </section>
    );
  return (
    <Form
      className="admin-settings-section admin-settings-engagement"
      title="Voting and public comments"
      label="Save"
      onSave={async (form) => {
        await run("engagement-control", {
          votingPaused: form.get("votingEnabled") !== "on",
          feedbackPaused: form.get("feedbackEnabled") !== "on",
          version: settings.version,
          reason: form.get("reason"),
          confirmation: "CHANGE_ENGAGEMENT",
        });
      }}
    >
      <label className="admin-switch-row">
        <span>Voting</span>
        <input
          type="checkbox"
          role="switch"
          name="votingEnabled"
          defaultChecked={!settings.votingPaused}
        />
        <span className="admin-switch-track" aria-hidden="true" />
      </label>
      <label className="admin-switch-row">
        <span>Public comments</span>
        <input
          type="checkbox"
          role="switch"
          name="feedbackEnabled"
          defaultChecked={!settings.feedbackPaused}
        />
        <span className="admin-switch-track" aria-hidden="true" />
      </label>
    </Form>
  );
}
function AdminCreditInstructions({
  providers,
  run,
}: {
  providers: Row[];
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [selected, setSelected] = useState(providers[0]?.id || "");
  const provider =
    providers.find((item) => item.id === selected) || providers[0];
  if (!provider)
    return (
      <section className="admin-settings-section admin-settings-credits">
        <h2>Credits instructions</h2>
        <p>No providers configured.</p>
      </section>
    );
  return (
    <Form
      key={`${provider.id}-${provider.instructions}`}
      className="admin-settings-section admin-settings-credits"
      title="Credits instructions"
      label="Save"
      onSave={async (form) => {
        await run("update-credit-instructions", {
          typeId: provider.id,
          markdown: form.get("markdown"),
          reason: form.get("reason"),
        });
      }}
    >
      <label>
        Provider
        <select
          value={provider.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        name="markdown"
        label="Instructions (Markdown)"
        type="textarea"
        value={provider.instructions || ""}
      />
    </Form>
  );
}
export function Settings({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [section, setSection] = useState("event");
  const settingsId = useId();
  const sections = [
    { id: "event", label: "Event" },
    { id: "results", label: "Results" },
    { id: "access", label: "Access" },
    ...(data.me?.owner ? [{ id: "content", label: "Content" }] : []),
  ];
  const panel = (id: string) => ({
    id: `${settingsId}-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${settingsId}-tab-${id}`,
    hidden: section !== id,
    className: "admin-settings-panel",
  });
  const resultControl = (kind: "ai" | "freeze" | "final") => ({
    allowed: data.resultControls?.[kind]?.allowed === true,
    reason: data.resultControls?.[kind]?.reason || "Reload result controls.",
  });
  return (
    <section className="admin-exact admin-workspace admin-settings-page">
      <header className="page-heading admin-exact-heading">
        <h1>
          <HeadingDot color="green" expression="squeezed" />
          Settings
        </h1>
      </header>
      <AdminWorkspaceTabs
        items={sections}
        value={section}
        onChange={setSection}
        prefix={settingsId}
        label="Settings sections"
      />
      <div {...panel("event")}>
        {data.me?.owner && (
          <OwnerSubmissionWindow
            key={`${data.policyVersion}-${data.policy?.submissionOpen}-${data.policy?.submissionClose}`}
            owner={true}
            open={data.policy?.submissionOpen || ""}
            close={data.policy?.submissionClose || ""}
            run={run}
          />
        )}
        <AdminEngagementControls
          key={`engagement-${data.engagement?.version ?? "pending"}`}
          data={data}
          run={run}
        />
      </div>
      <div {...panel("results")}>
        {(data.me?.owner || data.me?.role === "admin") && (
          <section className="admin-settings-section admin-settings-reveals">
            <h2>Results visibility</h2>
            <p className="admin-results-state">
              {data.scoreRelease?.stage === "ai"
                ? "AI scores revealed"
                : data.scoreRelease?.stage === "final"
                  ? "Final scores revealed"
                  : "Hidden"}
            </p>

            <Form
              title="AI evaluation"
              disabled={!resultControl("ai").allowed}
              disabledReason={resultControl("ai").reason}
              label="Reveal AI scores"
              onSave={async (f) => {
                await run("reveal-ai-scores", { reason: f.get("reason") });
              }}
            >
              <Field
                name="reason"
                label="Reveal reason"
                required
                minLength={5}
              />
            </Form>
            {data.me?.owner && (
              <Form
                title="Final judging snapshot"
                disabled={!resultControl("freeze").allowed}
                disabledReason={resultControl("freeze").reason}
                label="Freeze final scores"
                onSave={async (f) => {
                  await run("freeze-results", { reason: f.get("reason") });
                }}
              >
                <Field
                  name="reason"
                  label="Freeze reason"
                  required
                  minLength={5}
                />
              </Form>
            )}
            <Form
              title="Final results"
              disabled={!resultControl("final").allowed}
              disabledReason={resultControl("final").reason}
              label="Reveal Final score"
              onSave={async (f) => {
                await run("reveal-final-scores", {
                  snapshotId: f.get("snapshotId"),
                  reason: f.get("reason"),
                });
              }}
            >
              <Field name="snapshotId" label="Frozen final snapshot">
                <select name="snapshotId" required>
                  <option value="">Choose a frozen snapshot</option>
                  {(data.resultSnapshots || []).map((r: Row) => (
                    <option key={r.id} value={r.id}>
                      {r.created_at}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                name="reason"
                label="Reveal reason"
                required
                minLength={5}
              />
            </Form>
            {data.scoreRelease?.remainingAwards?.length > 0 && (
              <Form
                title="Unveil one award"
                disabled={data.readiness?.scoring?.ready !== true}
                label="Unveil selected award"
                onSave={async (f) => {
                  await run("unveil-winner", {
                    releaseId: data.scoreRelease.releaseId,
                    position: Number(f.get("position")),
                    reason: f.get("reason"),
                  });
                }}
              >
                <Field name="position" label="Choose an unrevealed award">
                  <select name="position" required>
                    <option value="">Choose an award</option>
                    {data.scoreRelease.remainingAwards.map((a: Row) => (
                      <option key={a.position} value={a.position}>
                        Award {a.position}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  name="reason"
                  label="Unveil reason"
                  required
                  minLength={5}
                />
              </Form>
            )}
          </section>
        )}
      </div>
      <div {...panel("access")}>
        <AddAdmins owner={!!data.me?.owner} title="Admin access" run={run} />
        <AdminCreditInstructions
          providers={data.creditInstructions || []}
          run={run}
        />
      </div>
      <div {...panel("content")}>
        {data.me?.owner && (
          <section className="admin-event-content-workspace">
            <ContentEditor
              key={`public-${data.content?.revision}`}
              data={data}
              run={run}
              scope="public"
            />
          </section>
        )}{" "}
        {data.me?.owner && (
          <details className="admin-settings-extra">
            <summary>
              Scoring configuration
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <OwnerPolicyControls data={data} run={run} />
          </details>
        )}
      </div>
    </section>
  );
}
const canonical = (p: string) =>
  ({
    "/dashboard/profile": "/profile",
    "/dashboard/submission": "/dashboard",
    "/submission": "/dashboard",
    "/teams": "/discover/teams",
    "/dashboard/team": "/dashboard",
    "/dashboard/credits": "/dashboard",
    "/credits": "/dashboard",
    "/admin": "/admin/participants",
    "/admin/audit": "/admin/logs",
    "/judge": "/review",
  })[p] || p;
export default function Portal({
  path: original,
  localTest = false,
  initialPublic,
  initialView,
  pendingPath = null,
  onNavigate,
}: {
  path: string;
  localTest?: boolean;
  initialPublic?: View;
  initialView?: View;
  pendingPath?: string | null;
  onNavigate?: (event: { preventDefault(): void }, destination: string) => void;
}) {
  const hydrated = useHydrated();
  const path = canonical(original);
  function navigate(event: { preventDefault(): void }, destination: string) {
    if (!onNavigate || canonical(destination) === path) return;
    setMenu(false);
    onNavigate(event, destination);
  }
  const [data, setData] = useState<View>(initialView || initialPublic || {}),
    [loading, setLoading] = useState(!initialView && !initialPublic && path !== "/"),
    [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [message, setMessage] = useState(""),
    [messageTone, setMessageTone] = useState<"success" | "error">("success"),
    [menu, setMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const gate = useRef<ConfirmationGate | null>(null),
    actionBusy = useRef(false),
    mutationKeys = useRef(new Set<string>()),
    loadGeneration = useRef(0),
    loadAbort = useRef<AbortController | null>(null),
    lastRefresh = useRef(0),
    hasLoadedView = useRef(!!initialView || !!initialPublic),
    presentationCache = useRef(new AdminPresentationCache());
  if (!gate.current) gate.current = new ConfirmationGate(setConfirmation);
  async function load() {
    const generation = ++loadGeneration.current;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    lastRefresh.current = Date.now();
    setLoading(!hasLoadedView.current);
    setError("");
    try {
      const focus=new URLSearchParams(window.location.search).get("project") || "";
      const options={search:"",page:0,focus};
      const version=await presentationCache.current.knownVersion(path,data.me,options);
      const url=`/api/portal?view=${encodeURIComponent(path)}&focus=${encodeURIComponent(focus)}`;
      let {response: r,body}=await readPortalView(url+(version?"&presentation="+encodeURIComponent(version):""),controller.signal);
      if (generation !== loadGeneration.current) return;
      if (!r.ok) {
        presentationCache.current.clear();
        setErrorCode(body.code || "");
        hasLoadedView.current = false;
        setData({});
        throw new Error(
          body.message || body.code || "This page could not be loaded.",
        );
      }
      let hydrated: View;
      try {hydrated=await presentationCache.current.merge(body,path,options);}
      catch(error){
        if(!(error instanceof AdminPresentationCacheMiss))throw error;
        const full=await readPortalView(url,controller.signal);
        if(!full.response.ok)throw new Error(full.body.message || "This page could not be loaded.");
        hydrated=await presentationCache.current.merge(full.body,path,options);
      }
      if(generation!==loadGeneration.current || controller.signal.aborted)return;
      setErrorCode("");
      hasLoadedView.current = true;
      setData(hydrated);
    } catch (e) {
      if (generation === loadGeneration.current && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
      if (loadAbort.current === controller) loadAbort.current = null;
    }
  }
  useEffect(() => {
    if (initialView) {
      void presentationCache.current.merge(initialView,path,{search:"",page:0,focus:""}).catch(()=>{});
      setData(initialView);
      hasLoadedView.current = true;
      setLoading(false);
      lastRefresh.current=Date.now();
    } else {
      if (initialPublic) {
        setData(initialPublic);
        hasLoadedView.current = true;
      } else {
        hasLoadedView.current = false;
      }
      void load();
    }
    const refresh = () => {
      if (document.visibilityState === "visible" && !actionBusy.current && !loadAbort.current && Date.now()-lastRefresh.current>=2_000)
        void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      ++loadGeneration.current;
      loadAbort.current?.abort();
    };
  }, [path, initialView, initialPublic]);
  useEffect(() => {
    const hide = () => {
      ++loadGeneration.current;
      loadAbort.current?.abort();
      gate.current?.decide(false);
      presentationCache.current.clear();
      hasLoadedView.current = false;
      setData({});
      setLoading(true);
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) void load();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      gate.current?.decide(false);
    };
  }, [path]);
  const run = async (action: string, values: Row) => {
    const mutationKey=action+":"+(values.columnId||values.batchId||values.projectId||values.teamId||values.userId||values.typeId||values.digest||"page");
    if (mutationKeys.current.has(mutationKey) || gate.current?.pending) throw new ActionCancelled();
    mutationKeys.current.add(mutationKey);
    actionBusy.current = true;
    try {
      if (
        requiresActionConfirmation(action) &&
        !(await gate.current!.ask(
          portalConfirmationFor(
            action,
            action === "submit-project"
              ? {
                  ...values,
                  attemptsUsed: Number.isInteger(
                    data.submissionAccess?.attemptsUsed,
                  )
                    ? data.submissionAccess.attemptsUsed
                    : data.attempts?.length || 0,
                }
              : values,
            action === "complete-profile"
              ? data.me?.name || "Your profile"
              : portalTargetName(data, values),
          ),
        ))
      )
        throw new ActionCancelled();
      const token = revealConfirmation(action, values);
      const { newCount: _count, singleEmail: _email, ...payload } = values;
      const result = await api(
        action,
        token ? { ...payload, confirmation: token } : payload,
      );
      setMessageTone("success");
      setMessage(result.message || "Saved.");
      await load();
      return result;
    } catch (e) {
      if (!(e instanceof ActionCancelled)) {
        setMessageTone("error");
        setMessage((e as Error).message);
      }
      throw e;
    } finally {
      mutationKeys.current.delete(mutationKey);
      actionBusy.current = mutationKeys.current.size>0;
    }
  };
  const logout = async () => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    try {
      if (
        !(await gate.current!.ask(
          confirmationFor("logout", {}, data.me?.name || "This portal session"),
        ))
      ) {
        return;
      }
      if (localTest) await api("local-signout", {});
      else {
        const response = await fetch("/api/auth/signout", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ returnTo: "/" }),
        });
        if (!response.ok) throw new Error("Sign out failed. Try again.");
      }
      presentationCache.current.clear();
      setData({});
      setMessageTone("success");
      setMessage("Signing out…");
      const link = document.createElement("a");
      link.href = "/";
      link.target = "_top";
      link.click();
    } catch (e) {
      setMessageTone("error");
      setMessage((e as Error).message);
    } finally {
      actionBusy.current = false;
    }
  };
  const { admin, privileged, items: nav } = portalNavigation(path, data.me);
  const profileOnboarding =
    (path === "/profile" && data.me?.mode !== "viewer") ||
    (path === "/dashboard" &&
      !!data.profileIncomplete &&
      data.me?.mode !== "viewer");
  const publicBrowse = path.startsWith("/projects") || path === "/leaderboard";
  const workspaceShell = path !== "/" && !publicBrowse && !profileOnboarding;
  const c =
    teamPalettes[(data.team?.palette || "forest") as Palette] ||
    teamPalettes.forest;
  return (
    <div
      className={`app-shell ${path === "/" ? "public-home-shell" : ""} ${profileOnboarding ? "onboarding-shell" : ""} ${workspaceShell ? "workspace-shell" : ""} ${publicBrowse ? "public-project-shell" : ""}`.trim()}
      style={{ "--team-accent": c.ink, "--team-wash": c.wash } as CSSProperties}
    >
      {confirmation && (
        <ConfirmationDialog
          value={confirmation}
          decide={(yes) => gate.current?.decide(yes)}
        />
      )}

      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {(path === "/" || publicBrowse) && (
        <header className="public-header">
          <a className="public-brand" href="/">
            <img
              src="/brand/codex-user-supplied.svg"
              width="32"
              height="32"
              alt=""
            />
            Codex Community New Delhi
          </a>
          <button
            className="public-menu button secondary"
            disabled={!hydrated}
            aria-controls="mobile-navigation"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={(event) => { event.currentTarget.focus(); setMenu(!menu); }}
          >
            <Icon name={menu ? "close" : "menu"} />
            <span className="sr-only">{menu ? "Close menu" : "Open menu"}</span>
          </button>
          <nav
            id="public-navigation"
            aria-label="Public navigation"
            data-open={false}
          >
            <Link prefetch={false} href="/" onNavigate={(event) => navigate(event, "/")} aria-current={path === "/" ? "page" : undefined}>
              {publicBrowse && <Icon name="home" />}
              Home
            </Link>
            <Link
              prefetch={false}
              href="/projects"
              onNavigate={(event) => navigate(event, "/projects")}
              aria-current={publicBrowse ? "page" : undefined}
            >
              {publicBrowse && <Icon name="projects" />}Projects
            </Link>
            <a
              className={publicBrowse ? "public-dashboard-link" : "button"}
              href={
                data.me
                  ? "/dashboard"
                  : "/signin?returnTo=%2Fdashboard"
              }
              target="_top"
            >
              {publicBrowse && <Icon name="person" />}
              {data.me
                ? publicBrowse
                  ? "Open your Dashboard"
                  : "Dashboard"
                : "Sign in"}
            </a>
          </nav>
        </header>
      )}
      <header className="mobile-header">
        <a className="brand" href="/" aria-label="DevDay Exchange home">
          <img
            src="/brand/codex-user-supplied.svg"
            width="32"
            height="32"
            alt=""
          />
          <span>Codex Community New Delhi</span>
        </a>
        <button
          className="button secondary"
          disabled={!hydrated}
          aria-expanded={menu}
          aria-controls="mobile-navigation"
          aria-haspopup="dialog"
          onClick={(event) => { event.currentTarget.focus(); setMenu(!menu); }}
        >
          <Icon name={menu ? "close" : "menu"} />
          <span className="sr-only">{menu ? "Close menu" : "Open menu"}</span>
        </button>
        {data.me && (
          <a
            className="header-account"
            href={
              privileged ||
              data.me.role === "volunteer" ||
              data.me.mode === "viewer"
                ? "/dashboard"
                : "/profile"
            }
            aria-label={
              privileged ||
              data.me.role === "volunteer" ||
              data.me.mode === "viewer"
                ? "Your Dashboard"
                : "Your profile"
            }
          >
            {privileged || data.me.role === "volunteer" ? (
              <UserRound size={22} aria-hidden="true" />
            ) : (
              <DotAvatar
                color={data.me.avatarColor}
                expression={data.me.avatarExpression}
                size={38}
                decorative
              />
            )}
          </a>
        )}
      </header>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="DevDay Exchange home">
          <img
            src="/brand/codex-user-supplied.svg"
            width="32"
            height="32"
            alt=""
          />
          <span>Codex Community New Delhi</span>
        </a>
        <nav
          id="site-navigation"
          aria-label={admin ? "Administration" : "Main navigation"}
        >
          {nav.map(([href, label]) => (
            <Link
              prefetch={false}
              key={href}
              href={href}
              onNavigate={(event) => navigate(event, href)}
              aria-current={
                path === href ||
                (href === "/dashboard" && path === "/submission") ||
                (href === "/discover/teams" &&
                  path === "/discover/participants")
                  ? "page"
                  : undefined
              }
            >
              <Icon
                name={
                  label === "Home"
                    ? "home"
                    : label === "Dashboard"
                      ? "dashboard"
                      : label === "Participants"
                        ? "users"
                        : label === "Teams"
                          ? "team"
                          : label === "Discover"
                            ? "discover"
                            : label === "Leaderboard"
                              ? "leaderboard"
                              : label === "Rules"
                                ? "rules"
                                : label === "Credits" ? "credits" : label === "Settings"
                                  ? "settings"
                                  : label === "Logs"
                                    ? "logs"
                                    : "projects"
                }
              />
              {label}
            </Link>
          ))}
          {!data.me && (
            <a href="/signin?returnTo=%2Fdashboard" target="_top">
              Sign in
            </a>
          )}
        </nav>
        <div className="account-controls">
          {data.me ? (
            <>
              <strong>{data.me.name}</strong>
              <small>
                {data.me.owner
                  ? "Owner"
                  : data.me.mode === "viewer"
                    ? "Viewer"
                    : data.me.role}
              </small>
              {data.me.mode !== "viewer" && (
                <a
                  href="/profile"
                  aria-label="Your profile"
                  className="personal-profile-link"
                >
                  <DotAvatar
                    color={data.me.avatarColor}
                    expression={data.me.avatarExpression}
                    size={40}
                  />
                  <span>Your profile</span>
                </a>
              )}
              {(privileged || data.me.role === "volunteer") && (
                <a href={admin ? "/dashboard" : "/admin/participants"}>
                  {admin ? "Workspace" : "Administration"}
                </a>
              )}
              <button
                className="link-button account-logout"
                type="button"
                onClick={() => void logout()}
              >
                <LogOut size={20} aria-hidden="true" />
                <span>Log out</span>
              </button>
            </>
          ) : (
            <p>
              November 1<br />
              New Delhi
            </p>
          )}
        </div>
      </aside>
      <MobileNavigation open={menu} onClose={() => setMenu(false)}>
        {nav.map(([href, label]) => (
          <Link prefetch={false} key={href} href={href} onNavigate={(event) => navigate(event, href)} aria-current={path === href ? "page" : undefined}><Icon name={navigationIcon(label)} />{label}</Link>
        ))}
        {!data.me ? (
          <a href="/signin?returnTo=%2Fdashboard" target="_top"><Icon name="person" />Sign in</a>
        ) : (
          <>
            {data.me.mode !== "viewer" && <a href="/profile"><Icon name="person" />Your profile</a>}
            {(privileged || data.me.role === "volunteer") && (
              <a href={admin ? "/dashboard" : "/admin/participants"}>
                <Icon name={admin ? "dashboard" : "settings"} />
                {admin ? "Workspace" : "Administration"}
              </a>
            )}
            <button className="navigation-logout" type="button" onClick={() => { setMenu(false); requestAnimationFrame(() => void logout()); }}><LogOut size={24} aria-hidden="true" />Log out</button>
          </>
        )}
      </MobileNavigation>
      <main
        id="main"
        tabIndex={-1}
        className={path === "/" ? "main home-main" : "main"}
      >
        {localTest && (
          <div className="rehearsal-banner">
            Local rehearsal · synthetic accounts only{" "}
            <a href="/local-test">Switch fixture</a>
          </div>
        )}
        {message && (
          <div className="action-message" data-tone={messageTone} role={messageTone === "error" ? "alert" : "status"}>
            {messageTone === "success" && <CircleCheck size={20} aria-hidden="true" />}
            <span>{message}</span>
            <button type="button" onClick={() => setMessage("")} aria-label="Dismiss notification"><X size={18} aria-hidden="true" /></button>
          </div>
        )}
        {error && (
          <section className="page-error-card" role="alert">
            <HeadingDot color="orange" expression="sleepy" size={48} paused />
            <h1>{errorCode === "LUMA_EMAIL_MISMATCH" ? "Use your registered email" : "This page could not load"}</h1>
            <p>{error}</p>
            <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => {
                void load();
              }}
            >
              Try again
            </button>
            {errorCode === "LUMA_EMAIL_MISMATCH" ? (
              <button className="button" onClick={() => void logout()}>
                Sign out / switch account
              </button>
            ) : (
              !data.me && (
                <a
                  className="text-link"
                  target="_top"
                  href={`/signin?returnTo=${encodeURIComponent(path)}`}
                >
                  Sign in
                </a>
              )
            )}
            </div>
          </section>
        )}
        {pendingPath ? (
          <RouteSkeleton path={pendingPath} />
        ) : path === "/" ? (
          <Home
            content={data.content || defaultPublicContent}
            submissionClose={data.submissionClose}
            signedIn={!!data.me}
          />
        ) : path === "/local-test" && localTest ? (
          <section className="panel">
            <h1>Local rehearsal</h1>
            <p>These are fake identities, never production sign-in.</p>
            {[
              "owner",
              "admin",
              "judge",
              "alice",
              "bob",
              "pending",
              "stranger",
            ].map((f) => (
              <button
                key={f}
                className="button secondary"
                onClick={async () => {
                  await api("local-signin", { fixture: f });
                  window.location.assign("/dashboard");
                }}
              >
                {f}
              </button>
            ))}
          </section>
        ) : loading ? (
          <RouteSkeleton path={path} />
        ) : (
          !error && (
            <>
              {data.profileIncomplete &&
              data.me?.mode !== "viewer" &&
              (path === "/dashboard" || path === "/profile") ? (
                <Profile data={data} run={run} gated />
              ) : path === "/profile" ? (
                data.me?.mode === "viewer" ? (
                  <Dashboard data={data} run={run} />
                ) : (
                  <Profile data={data} run={run} />
                )
              ) : path === "/rules" ? (
                <SharedRules categories={data.categories || []} />
              ) : path === "/dashboard" ? (
                <Dashboard data={data} run={run} />
              ) : path === "/discover/teams" ||
                path === "/discover/participants" ? (
                <Discover data={data} path={path} run={run} />
              ) : path === "/submission" ? (
                <Submission
                  key={`${data.project?.revision || 0}-${data.team?.id || "none"}`}
                  data={data}
                  run={run}
                />
              ) : path.startsWith("/projects") || path === "/leaderboard" ? (
                <Projects data={data} path={path} run={run} />
              ) : path === "/admin/participants" ? (
                <AdminParticipants data={data} run={run} />
              ) : path === "/admin/settings" ? (
                <Settings data={data} run={run} />
              ) : /^\/(admin\/submissions|review)\//.test(path) ? (
                <Review data={data} run={run} />
              ) : path.startsWith("/admin") || path === "/review" ? (
                <AdminList data={data} path={path} run={run} />
              ) : (
                <Empty>Choose a page from the navigation.</Empty>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}

function StatusChange({
  kind,
  target,
  name,
  current,
  run,
  compact = false,
  disabled = false,
  children,
}: {
  kind: "person" | "team";
  target: string;
  name: string;
  current: string;
  run: (a: string, d: Row) => Promise<Row>;
  compact?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const content = (
    <>
      {!disabled && (
        <Form
          title={name}
          label="Review status change"
          onSave={async (f) => {
            await run("admin-status", {
              kind,
              targetId: target,
              status: f.get("status"),
              reason: f.get("reason"),
            });
          }}
        >
          <label>
            New status
            <select name="status" defaultValue={current}>
              {(kind === "person"
                ? ["Registered", "Going", "Checked in", "Absent"]
                : ["Forming", "Locked", "Not submitted", "Submitted"]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <Field name="reason" label="Audit reason" minLength={5} required />
        </Form>
      )}
      {children && (
        <div className="admin-status-target-actions">{children}</div>
      )}
    </>
  );
  if (compact) return <AdminStatusMenu name={name}>{content}</AdminStatusMenu>;
  return <details>
    <summary aria-label={`Change ${name} status`} title={`Change ${name} status`}>Change {name} status</summary>
    {content}
  </details>;
}
