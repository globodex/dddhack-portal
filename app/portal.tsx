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
  UserCheck,
  Users,
  UserRound,
  UsersRound,
  X,
  Ticket,
  Pencil,
  LockKeyholeOpen,
  Flag,
} from "lucide-react";
import AddAdmins from "./add-admins";
import AdminTeamCard from "./admin-team-card";
import AdminTeamActions from "./admin-team-actions";
import AdminCreditBatches from "./admin-credit-batches";
import PersonalCredits, { PersonalCreditsContent } from "./personal-credits";
import ProjectShare from "./project-share";
import AdminLeaderTransfer from "./admin-leader-transfer";
import Link from "next/link";
import dynamic from "next/dynamic";
import ResultVisibility, { PrivateAIEvaluation } from "./result-visibility";
const JudgingSettings = dynamic(() => import("./judging-settings"), {
  loading: () => <div className="results-ui-judgingLoading" role="status" aria-label="Loading judging setup" />,
});
import { useDiscoverPeople, peopleDirectoryUrl, readPeoplePage } from "./use-discover-people";
import { HeadingDot } from "./expressive-heading";
import RouteSkeleton from "./route-skeleton";
import ViewerWelcome from "./viewer-welcome";
import { portalLoadFailure, type PortalLoadFailure } from "../lib/portal-load-state";
import MobileNavigation from "./mobile-navigation";
import NavigationHeader from "./navigation-header";
import { useHydrated } from "./use-hydrated";
import { portalErrorText, portalSuccessText } from "../lib/ui-feedback";
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
import ProjectMediaField from "./project-media-field";
import SubmissionDots from "./submission-dots";
import ProjectSubmissionSuccess from "./project-submission-success";
import { submittedProjectSuccess, type SubmissionSuccessState } from "../lib/project-share";
import CommittedSubmissions, { CommittedSubmission } from "./committed-submissions";
import { resolveTeamColor } from "../lib/team-color";
import { prepareProjectImage } from "./prepare-project-image";
import ProfileFlow from "./profile-flow";
import AdminImportDialog from "./admin-import-dialog";
import AdminStatusMenu from "./admin-status-menu";
import { trapDialogFocus } from "./dialog-focus";
import { consumeDialogHistoryForNavigation, trackDialogHistory } from "./dialog-history";
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
import { defaultPublicContent } from "../lib/public-content-defaults";
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
    hasProfileAvatar?: boolean;
    mode?: "viewer" | "participant" | "staff";
    rostered?: boolean;
    deactivated?: boolean;
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
  if (!r.ok) throw new Error(portalErrorText(b));
  return b as Row;
}
export function portalConfirmationFor(
  action: string,
  values: Row,
  target: string,
): Confirmation {
  const base = confirmationFor(action, values, target);
  if (action === "publish-credit-batch" && values.creditImportSummary) {
    const counts = values.creditImportSummary;
    return {
      ...base,
      title: "Add credits?",
      target: Array.isArray(values.columns) ? values.columns.length > 3 ? `${values.columns.length} categories` : values.columns.map((column: Row) => column.heading).join(", ") : target,
      description: `${counts.added} to add · ${counts.duplicates} duplicates skipped${counts.retired ? ` · ${counts.retired} previously removed` : ""}`,
      confirmLabel: "Add credits",
    };
  }
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
        "Remove this sole-member team. History stays intact.",
      confirmLabel: "Delete this team",
      critical: true,
    };
  if (action === "participant-deactivate")
    return {
      ...base,
      title: "Remove participant",
      description:
        "Revoke participation and private access. Their history stays intact.",
      confirmLabel: "Remove this participant",
      critical: true,
    };
  if (action === "participant-restore")
    return {
      ...base,
      title: "Restore participant",
      description:
        "Restore participation without granting admin access.",
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
        ? `Restore this ${scope}. History and used attempts stay unchanged.`
        : `Hide this ${scope}. History and used attempts remain; older versions stay hidden.`,
      confirmLabel: `${restoring ? "Restore" : "Remove"} this target`,
      critical: true,
    };
  }
  if (action === "save-operational-setup")
    return {
      ...base,
      title: "Confirm operational setup",
      description: "Save these rules. This does not enable an event operation.",
      confirmLabel: "Save these confirmations",
      critical: true,
    };
  if (action === "publish-submission-window")
    return {
      ...base,
      title: "Publish submission window",
      description: "Save these times for everyone. Attempts and the repository cutoff stay unchanged." +
        (Array.isArray(values.windowWarnings) && values.windowWarnings.some((warning: unknown) => typeof warning === "string" && /judging/i.test(warning)) ? " Judging dates also need updating." : ""),
      confirmLabel: "Publish these times",
      critical: true,
    };
  if (action === "engagement-control")
    return {
      ...base,
      title: "Change community engagement",
      description: `Voting will be ${values.votingPaused ? "paused" : "open"}; public feedback will be ${values.feedbackPaused ? "paused" : "open"}. Existing votes, comments and frozen scores remain unchanged.`,
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
  if (action === "revoke-admin")
    return {
      ...base,
      title: "Revoke admin access?",
      description: "They keep their participant account, profile and team.",
      confirmLabel: "Revoke access",
      critical: true,
    };
  if (action === "commit-import")
    return {
      ...base,
      title: "Add participants?",
      target: values.singleEmail || `${values.newCount || 0} ${Number(values.newCount) === 1 ? "participant" : "participants"}`,
      description: "",
      confirmLabel: "Confirm",
      critical: false,
    };
  return base;
}
export function portalTargetName(data: View, values: Row): string {
  if (typeof values.id === "string" && ["accepted", "declined"].includes(values.decision)) {
    const invitation = (data.actions || []).find((item: Row) => item.id === values.id && item.kind === "invite");
    if (typeof invitation?.team_name === "string" && invitation.team_name.trim()) return invitation.team_name;
  }
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
    ...(data.adminAccess?.items || []),
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
            defaultValue={String(value ?? "")}
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
            defaultValue={String(value ?? "")}
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
  const hydrated = useHydrated();
  return (
    <label className="search-label">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        disabled={!hydrated}
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

function CreateTeam({
  run,
  onClose,
  titleId,
}: {
  run: (a: string, d: Row) => Promise<Row>;
  onClose?: () => void;
  titleId?: string;
}) {
  const [name, setName] = useState(""),
    [palette, setPalette] = useState("forest"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hydrated, setHydrated] = useState(false);
  const fallbackTitle = useId(), errorId = useId(), submitting = useRef(false),
    closeButton = useRef<HTMLButtonElement>(null);
  const headingId = titleId || fallbackTitle;
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (hydrated) closeButton.current?.focus({ preventScroll: true });
  }, [hydrated]);
  return (
    <form
      className="panel team-create-form"
      method="post"
      inert={!hydrated}
      aria-labelledby={headingId}
      aria-busy={!hydrated || busy}
      data-hydrated={hydrated}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!hydrated || submitting.current) return;
        const values = new FormData(event.currentTarget);
        submitting.current = true;
        setBusy(true);
        setError("");
        try {
          await run("create-workspace-team", {
            name: values.get("name"),
            bio: values.get("bio"),
            avatar: "initials",
            palette,
          });
        } catch (cause) {
          if (!(cause instanceof ActionCancelled)) setError((cause as Error).message);
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <header className="team-creation-header">
        <h2 id={headingId}>Create your team</h2>
        {onClose && (
          <button ref={closeButton} type="button" className="team-creation-close" autoFocus aria-label="Close team creation" onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="team-creation-body">
        <fieldset className="team-creation-controls" disabled={busy || !hydrated}>
          <legend className="sr-only">Team details</legend>
          <section className="team-creation-identity" aria-label="Team identity">
            <div className="team-creation-preview">
              <TeamAvatar name={name || "Team"} palette={palette} size={64} />
            </div>
            <fieldset className="team-creation-color">
              <legend>Team color <output aria-live="polite">{teamColorLabels[palette]}</output></legend>
              <div className="team-creation-palette">
                {teamColorKeys.map((key) => (
                  <label key={key} title={teamColorLabels[key]} data-selected={palette === key}>
                    <input type="radio" name="palette" value={key} checked={palette === key} onChange={() => setPalette(key)} />
                    <span className="team-creation-swatch" style={{ backgroundColor: teamDotColors[key] }} aria-hidden="true" />
                    <span className="sr-only">{teamColorLabels[key]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <div className="team-creation-fields">
            <label>
              <span>Team name <span className="required-mark" aria-hidden="true">*</span></span>
              <input name="name" required maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>Team intro</span>
              <textarea name="bio" rows={3} maxLength={1000} />
            </label>
          </div>
        </fieldset>
      </div>
      <footer className="team-creation-footer">
        {error && <p className="team-creation-error" id={errorId} role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy || !hydrated} aria-describedby={error ? errorId : undefined}>
          {busy ? "Creating…" : "Create team"}
        </button>
      </footer>
    </form>
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
function StudioDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    callback = useRef(onClose),
    heading = useId();
  callback.current = onClose;
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const { body, documentElement } = node.ownerDocument;
    const bodyOverflow = body.style.overflow;
    const htmlOverflow = documentElement.style.overflow;
    const close = openDiscoveryDialog(node, () => callback.current());
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    return () => {
      close();
      body.style.overflow = bodyOverflow;
      documentElement.style.overflow = htmlOverflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`studio-dialog${title === "Team identity" ? " studio-identity-dialog" : ""}`}
      aria-labelledby={heading}
      onKeyDown={trapDialogFocus}
    >
      <header>
        <h2 id={heading}>{title}</h2>
        <button
          type="button"
          autoFocus
          className="studio-icon-button"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={() => dialog.current?.close()}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <div className="studio-dialog-body">{children}</div>
    </dialog>
  );
}
export function TeamWorkspace({
  data,
  run,
  onProject,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
  onProject?: () => void;
}) {
  const t = data.team,
    leader = !!t && data.me?.id === t.leader_id,
    locked = !!(t?.locked || data.ideaLocked);
  const [description, setDescription] = useState(
      String(data.idea?.description || ""),
    ),
    [title, setTitle] = useState(String(data.idea?.title || "")),
    [editing, setEditing] = useState(!data.idea?.title),
    [dialog, setDialog] = useState<"identity" | "invite" | null>(null);
  useEffect(() => {
    setTitle(String(data.idea?.title || ""));
    setDescription(String(data.idea?.description || ""));
  }, [data.idea?.title, data.idea?.description]);
  const requests = (data.actions || []).filter(
      (a: Row) =>
        a.kind === "request" && a.status === "pending" && a.team_id === t?.id,
    ),
    invitations = (data.actions || []).filter(
      (a: Row) =>
        a.kind === "invite" && a.status === "pending" && a.team_id === t?.id,
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
  const color = resolveTeamColor(t.palette),
    count = data.members?.length || 0,
    persisted = !!data.idea?.title?.trim() && !!data.idea?.description?.trim(),
    unchanged =
      title === String(data.idea?.title || "") &&
      description === String(data.idea?.description || ""),
    saved = persisted && unchanged;
  const used = Number.isInteger(data.submissionAccess?.attemptsUsed)
      ? data.submissionAccess.attemptsUsed
      : data.attempts?.length || 0,
    checkedCount = Math.max(
      0,
      Math.min(count, Number(data.teamFacts?.checkedInMembers) || 0),
    ),
    teamChecked = count > 0 && checkedCount === count;
  const canEditProject =
    leader &&
    data.me?.canParticipate === true &&
    data.submissionAccess?.canCommit === true &&
    !data.submissionAccess?.locked &&
    used < 3;
  const next = !locked
    ? {
        title: persisted ? "Make it official." : "Start with your idea.",
        detail: saved
          ? "Team not locked"
          : persisted
            ? "Save your changes before locking."
            : "Add a title and a short description.",
        action: "Review & lock team",
        kind: "lock",
      }
    : used >= 3
      ? {
          title: "Your project is in.",
          detail: "All three submissions are committed.",
          action: "View your project",
          kind: "project",
        }
      : canEditProject
        ? {
            title: used ? "Keep building." : "Bring it to life.",
            detail: used
              ? `${used}/3 submissions committed`
              : "Team locked. Your project is next.",
            action: used ? "Open project" : "Create your project",
            kind: "project",
          }
        : {
            title: used
              ? "Your project is in."
              : data.checkedIn
                ? "Ready for what's next."
                : "See you at check-in.",
            detail:
              data.submissionAccess?.message ||
              (!leader
                ? "Your leader submits the project."
                : "Project submission is not available yet."),
            action: data.submissionAccess?.canRead ? "View your project" : "",
            kind: "project",
          };
  return (
    <section
      className="team-workspace studio-team"
      style={
        {
          "--studio-team-fill": color.fill,
          "--studio-team-wash": color.wash,
          "--studio-team-ink": color.ink,
        } as CSSProperties
      }
    >
      <header className="studio-team-identity">
        <TeamAvatar name={t.name} palette={t.palette} size={150} />
        <div className="studio-team-name">
          <div>
            <h1>{t.name}</h1>
            {leader && !locked && (
              <button
                type="button"
                className="studio-icon-button"
                aria-label="Edit team name and color"
                onClick={() => setDialog("identity")}
              >
                <Pencil size={23} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="studio-team-status">
          <span>
            <UsersRound size={22} aria-hidden="true" />
            {locked ? "Team locked" : "Forming team"}
          </span>
          <span>{count}/5</span>
        </div>
      </header>
      <section className="studio-people" aria-label="Team members">
        <ul className="studio-member-list">
          {(data.members || []).map((m: Row) => (
            <li key={m.id}>
              <DotAvatar
                color={m.avatarColor}
                expression={m.avatarExpression}
                size={84}
              />
              <div className="studio-member-info">
                <div className="studio-member-name">
                  <strong>
                    {safeProfileUrl(m.profileUrl) ? (
                      <a href={safeProfileUrl(m.profileUrl)}>{m.name}</a>
                    ) : (
                      m.name
                    )}
                  </strong>
                  {m.role === "leader" && <Pill tone="positive">Leader</Pill>}
                </div>
                <span className="sr-only">
                  {m.status ||
                    (m.approval === "approved" ? "Going" : "Registered")}
                </span>
                <div className="studio-member-links">
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
                        width={23}
                        height={23}
                        alt=""
                      />
                    </a>
                  ))}
                  {safeExternalUrl(m.whatsappUrl) && (
                    <a
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
                  {m.phone && (
                    <a
                      href={`tel:${String(m.phone).replace(/[^+0-9]/g, "")}`}
                      aria-label={`Call ${m.name} at ${m.phone}`}
                      title={m.phone}
                    >
                      <Phone size={20} aria-hidden="true" />
                    </a>
                  )}
                  {leader && !locked && m.role !== "leader" && (
                    <TeamAction
                      action="remove-workspace-member"
                      values={{
                        userId: m.id,
                        reason: "Team leader removed membership",
                      }}
                      run={run}
                      className="studio-icon-button studio-remove"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                      <span className="sr-only">Remove {m.name} from team</span>
                    </TeamAction>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {leader && !locked && (
          <button
            type="button"
            className="studio-invite"
            disabled={count >= 5}
            onClick={() => setDialog("invite")}
          >
            <span>
              <Plus size={29} aria-hidden="true" />
            </span>
            <span>{count >= 5 ? "Team is full" : "Invite member"}</span>
          </button>
        )}
      </section>
      {requests.length > 0 && leader && !locked && (
        <section className="studio-requests" aria-label="Membership requests">
          <h3>
            Requests <span>{requests.length}</span>
          </h3>
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
      <div className="studio-work-grid">
        <section className="studio-idea" aria-label="Private team idea">
          <header className="studio-idea-heading">
            <span>
              <LockKeyhole size={21} aria-hidden="true" />
              Private idea
            </span>
            {saved && (
              <span className="studio-saved">
                <CircleCheck size={19} aria-hidden="true" />
                Saved
              </span>
            )}
          </header>
          {leader && !locked && editing ? (
            <Form
              className="studio-idea-form"
              label="Save idea"
              onSave={async () => {
                await run("save-workspace-idea", {
                  title: title.trim(),
                  description: description.trim(),
                });
                setEditing(false);
              }}
            >
              <fieldset>
                <label>
                  <span>
                    Idea title{" "}
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    autoFocus
                    name="title"
                    required
                    value={title}
                    minLength={2}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  <span>
                    Description{" "}
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <textarea
                    name="description"
                    required
                    value={description}
                    maxLength={500}
                    rows={5}
                    aria-describedby="studio-idea-count"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </fieldset>
              {persisted && (
                <button
                  type="button"
                  className="link-button studio-cancel-idea"
                  onClick={() => {
                    setTitle(String(data.idea.title));
                    setDescription(String(data.idea.description));
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              )}
            </Form>
          ) : (
            <div className="studio-idea-content">
              <div className="studio-idea-title">
                <h2>{data.idea?.title || "Your next big idea."}</h2>
                {leader && !locked && (
                  <button
                    type="button"
                    className="studio-icon-button"
                    aria-label="Edit team idea"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={22} aria-hidden="true" />
                  </button>
                )}
              </div>
              {data.idea?.description ? (
                <p>{data.idea.description}</p>
              ) : (
                <p className="studio-idea-empty">
                  Your leader hasn't saved an idea yet.
                </p>
              )}
            </div>
          )}
          <div className="studio-idea-footer">
            <span>
              {locked ? (
                <>
                  <LockKeyhole size={15} aria-hidden="true" />
                  Locked with your team
                </>
              ) : null}
            </span>
            <output
              id="studio-idea-count"
              aria-label="Description character count"
            >
              {editing
                ? description.length
                : String(data.idea?.description || "").length}
              /500
            </output>
          </div>
        </section>
        <aside className="studio-next" aria-labelledby="studio-next-title">
          <div className="studio-next-expression" aria-hidden="true">
            <DotAvatar
              color="grey"
              expression="squeezed"
              size={132}
              decorative
            />
          </div>
          <p className="studio-eyebrow">Next up</p>
          <h2 id="studio-next-title">{next.title}</h2>
          <p className="studio-next-detail">
            {locked ? (
              <LockKeyhole size={20} aria-hidden="true" />
            ) : (
              <LockKeyholeOpen size={20} aria-hidden="true" />
            )}
            {next.detail}
          </p>
          {next.kind === "lock" ? (
            leader ? (
              <TeamAction
                action="lock-team"
                values={{ confirmation: "LOCK_TEAM" }}
                run={run}
                disabled={!saved}
              >
                <span>{next.action}</span>
                <ArrowRight size={24} aria-hidden="true" />
              </TeamAction>
            ) : (
              <p className="studio-waiting-leader">
                Your leader locks the team.
              </p>
            )
          ) : (
            next.action && (
              <button type="button" className="button" onClick={onProject}>
                <span>{next.action}</span>
                <ArrowRight size={24} aria-hidden="true" />
              </button>
            )
          )}
        </aside>
      </div>
      <ol className="studio-progress" aria-label="Team progress" data-stage={used > 0 ? 3 : teamChecked ? 2 : t.locked ? 1 : 0}>
        {[
          {
            label: "Forming team",
            icon: <UsersRound size={22} />,
            done: true,
            current: !locked,
          },
          {
            label: "Locked",
            icon: <LockKeyhole size={22} />,
            done: !!t.locked,
            current: !!t.locked && !teamChecked && !used,
          },
          {
            label: "Team checked in",
            icon: <CircleCheck size={22} />,
            done: teamChecked,
            current: teamChecked && !used,
            detail: `${checkedCount}/${count} members`,
          },
          {
            label: "Submitted",
            icon: <Flag size={22} />,
            done: used > 0,
            current: used > 0,
          },
        ].map((stage) => (
          <li
            key={stage.label}
            data-complete={stage.done}
            aria-current={stage.current ? "step" : undefined}
          >
            <span className="studio-progress-icon" aria-hidden="true">
              {stage.icon}
            </span>
            <span>
              <strong>{stage.label}</strong>
              {stage.detail && <small>{stage.detail}</small>}
            </span>
          </li>
        ))}
      </ol>
      <div className="studio-personal-status">
        <UserRound size={16} aria-hidden="true" />
        You: {data.individualStatus || "Registered"}
      </div>
      {data.privateVenue && <DashboardVenue venue={data.privateVenue} />}
      {leader && !locked && count === 1 && (
        <div className="studio-delete-team">
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
      {dialog === "identity" && leader && !locked && (
        <StudioDialog title="Team identity" onClose={() => setDialog(null)}>
          <Form
            className="studio-identity-form"
            label="Save name"
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
          <TeamStyle key={t.palette} team={t} run={run} />
        </StudioDialog>
      )}
      {dialog === "invite" && leader && !locked && (
        <StudioDialog title="Invite a teammate" onClose={() => setDialog(null)}>
          <Form
            className="studio-invite-form"
            label="Send invitation"
            disabled={count >= 5}
            disabledReason={
              count >= 5 ? "Your team has five members." : undefined
            }
            onSave={async (f) => {
              await run("team-invite", { teamId: t.id, email: f.get("email") });
              setDialog(null);
            }}
          >
            <Field name="email" label="Email" type="email" required />
          </Form>
          <a className="text-link" href="/discover/participants">
            Find teammates
            <ArrowRight size={17} aria-hidden="true" />
          </a>
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
        </StudioDialog>
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
  onInteraction,
}: {
  data: View;
  run: (a: string, d: Row, options?: { errorFeedback?: "local" }) => Promise<Row>;
  editing: boolean;
  editorOpen: boolean;
  setEditing: (value: boolean) => void;
  onExit: () => void;
  onInteraction?: () => void;
}) {
  const project = data.project,
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
        onInteraction={onInteraction}
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
      </div>
      {data.projectStats?.result && (
        <PublicResult result={data.projectStats.result} />
      )}
          <div className="dashboard-project-toolbar">
            <div className="dashboard-project-metrics">
              {data.projectStats && <span className="dashboard-upvotes" aria-label={Number.isFinite(data.projectStats.upvotes) ? upvoteCountLabel(data.projectStats.upvotes) : "Upvote count unavailable"}>
                <ArrowUp size={20} aria-hidden="true" /><span aria-hidden="true">{Number.isFinite(data.projectStats.upvotes) ? data.projectStats.upvotes : "?"}</span>
              </span>}
              <span className="dashboard-project-feedback-count" aria-label={`Feedback: ${data.feedback?.length || 0}`}>
                <MessageSquare size={20} aria-hidden="true" /><span aria-hidden="true">{data.feedback?.length || 0}</span>
              </span>
            </div>
            {canRead && project?.published_version_id &&
              typeof project.slug === "string" && project.slug.trim() &&
              data.eligibility?.status === "eligible" && (
                <a
                  className="button secondary"
                  href={`/projects/${encodeURIComponent(project.slug)}`}
                >
                  View project
                  <ExternalLink size={17} aria-hidden="true" />
                </a>
              )}
            {canRead && canEdit && project?.published_version_id && (
              <button
                className="button dashboard-project-update"
                id="dashboard-project-edit"
                type="button"
                aria-expanded={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Close editor" : "Update project"}
              </button>
            )}
          </div>
      {canRead ? (
        <>
          {project?.published_version_id && !editorOpen && (
            <CommittedSubmissions
              key={`${project.revision || 0}-${project.published_version_id}`}
              canRead={canRead}
              currentVersionId={project.published_version_id}
              attempts={data.attempts || []}
              renderVersion={(payload) => <ProjectVersion payload={payload} />}
            />
          )}
          {!project?.published_version_id && !editorOpen && (
            <Submission
              key={`${project?.revision || 0}-${data.team?.id || "none"}`}
              data={data}
              run={run}
              onInteraction={onInteraction}
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
        id="dashboard-project-feedback"
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
  onInteraction,
}: {
  data: View;
  run: (a: string, d: Row, options?: { errorFeedback?: "local" }) => Promise<Row>;
  onInteraction?: () => void;
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
    return <ViewerWelcome removed={!!data.me.deactivated} />;
  return (
    <div className="dashboard-v6 team-studio" data-editor-open={editorOpen}>
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
          onProject={() => select("project")}
        />
      </section>
      <section
        id="credits"
        role="tabpanel"
        hidden={tab !== "credits"}
        className="dashboard-section dashboard-credits"
        aria-labelledby="dashboard-tab-credits"
      >
        <PersonalCreditsContent checkedIn={data.checkedIn === true} credits={data.credits || []} />
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
          onInteraction={onInteraction}
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
export { Credit } from "./personal-credits";
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

export function DiscoverTeamDialog({
  team,
  onClose,
}: {
  team: Row;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const callback = useRef(onClose);
  const color = resolveTeamColor(team.palette);
  const members = Array.isArray(team.members) ? team.members : [];
  useEffect(() => {
    callback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!dialog.current) return;
    const overflow = document.body.style.overflow;
    const gutter = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = "stable";
    document.body.style.overflow = "hidden";
    const release = openDiscoveryDialog(dialog.current, () => callback.current());
    return () => {
      release();
      document.body.style.overflow = overflow;
      document.documentElement.style.scrollbarGutter = gutter;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="discover-team-dialog-v6 discover-team-sheet"
      onKeyDown={trapDialogFocus}
      aria-labelledby="discover-team-title"
      style={{ "--discover-wash": color.wash } as CSSProperties}
    >
      <header className="discover-team-sheet-heading">
        <TeamAvatar name={team.name} palette={team.palette} size={64} />
        <div>
          <h2 id="discover-team-title">{team.name}</h2>
          <div className="discover-team-facts">
            <span>{team.readiness?.total ?? "?"}/5 members</span>
            <span className={`discover-state ${team.locked ? "locked" : "forming"}`}>
              {team.status || (team.locked ? "Locked" : "Forming")}
            </span>
          </div>
        </div>
        <button type="button" className="discover-dialog-close" autoFocus aria-label="Close team" onClick={() => dialog.current?.close()}>
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <div className="discover-team-sheet-body">
        {team.bio && <p className="discover-team-bio">{team.bio}</p>}
        <h3>Members</h3>
        {Array.isArray(team.members) ? (
          <ul className="discover-team-members">
            {members.map((member: Row, index: number) => {
              const href = safeProfileUrl(member.profileUrl);
              const identity = <><DotAvatar color={member.avatarColor} expression={member.avatarExpression} size={44} decorative /><strong>{member.name}</strong></>;
              return <li key={member.id || index}>{href ? (
                <a href={href} aria-label={`View ${member.name}'s profile`} onClick={() => consumeDialogHistoryForNavigation()}>
                  {identity}<ChevronRight size={20} aria-hidden="true" />
                </a>
              ) : <div>{identity}</div>}</li>;
            })}
          </ul>
        ) : <p className="discover-members-unavailable" role="status">Member details are unavailable.</p>}
      </div>
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
    callback = useRef(onClose),
    titleId = useId();
  useEffect(() => {
    callback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (dialog.current)
      return openDiscoveryDialog(dialog.current, () => callback.current());
  }, []);
  return (
    <dialog ref={dialog} className="team-create-dialog" onKeyDown={trapDialogFocus} aria-labelledby={titleId}>
      <CreateTeam run={run} titleId={titleId} onClose={() => dialog.current?.close()} />
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
  const hydrated = useHydrated();
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
    <section className="discover-v6" data-hydrated={hydrated}>
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
            disabled={!hydrated}
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
            disabled={!hydrated}
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
                disabled={!hydrated}
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
        {items.map((row) => {
          const bio = typeof row.bio === "string" ? row.bio.trim() : "";
          const color = resolveTeamColor(participants ? row.teamPalette : row.palette);
          return (
            <li
              key={row.id}
              id={participants ? `person-${row.id}` : undefined}
              className={`discover-card ${participants ? "discover-person-card" : "discover-team-card"}`}
              data-has-bio={!!bio}
              style={{ "--discover-wash": color.wash, "--discover-accent": color.ink } as CSSProperties}
            >
              {participants ? (
                <>
                  <div className="discover-person-heading">
                    <DotAvatar color={row.avatarColor} expression={row.avatarExpression} size={56} decorative />
                    <div className="discover-identity"><h2>{row.name}</h2></div>
                    <button type="button" className="discover-profile-open discover-card-arrow" aria-label={`View ${row.name}'s profile`} aria-haspopup="dialog" disabled={!hydrated} onClick={() => setSelectedPerson(discoveryProfileProjection(row))}>
                      <ChevronRight size={22} aria-hidden="true" />
                    </button>
                  </div>
                  {bio && <p className="discover-person-bio">{bio}</p>}
                  <div className="discover-person-footer">
                    <div className={`discover-card-membership ${row.teamName ? "joined" : "unjoined"}`}>
                      {row.teamName ? <TeamAvatar name={row.teamName} palette={row.teamPalette} size={28} /> : <Users size={18} aria-hidden="true" />}
                      <span className="discover-card-team-name">
                        {row.teamName && <span className="sr-only">In a team: </span>}
                        {row.teamName || "Not in a team"}
                      </span>
                    </div>
                    <DiscoverSocials socials={row.socials} />
                  </div>
                </>
              ) : (
                <>
                  <div className="discover-team-card-heading">
                    <TeamAvatar name={row.name} palette={row.palette} size={64} />
                    <div className="discover-identity"><h2>{row.name}</h2></div>
                    <button type="button" className="discover-team-open discover-card-arrow" aria-label={`View ${row.name} team`} aria-haspopup="dialog" disabled={!hydrated} onClick={() => setSelectedTeam(row)}>
                      <ChevronRight size={22} aria-hidden="true" />
                    </button>
                  </div>
                  {bio && <p className="discover-team-summary">{bio}</p>}
                  <div className="discover-team-facts">
                    <span className="discover-team-size"><Users size={17} aria-hidden="true" />{row.readiness?.total ?? "?"}/5 members</span>
                    <span className={`discover-state ${row.locked ? "locked" : "forming"}`}>{row.status || (row.locked ? "Locked" : "Forming")}</span>
                  </div>
                  {(data.team?.id === row.id || (canCreate && !row.locked && Number(row.readiness?.total) < 5)) && (
                    <div className="discover-team-action">
                      {data.team?.id === row.id ? <a href="/dashboard" className="discover-view-team">Your team<ArrowRight size={17} aria-hidden="true" /></a> : (
                        <TeamAction action="request-team" values={{ teamId: row.id }} run={run} className="discover-request" disabled={!!row.requested}>
                          {row.requested ? "Requested" : "Request to join"}
                        </TeamAction>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
        {participants &&
          people.loading &&
          Array.from({ length: items.length ? 3 : 6 }, (_, index) => (
            <li
              className="discover-card discover-person-card discover-person-skeleton"
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
          {people.loading && <p role="status" aria-live="polite">Loading people…</p>}
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
    <section className="rules-v6 rules-essentials">
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
      <div className="rules-groups">
        {categories.map((category, index) => (
          <section className="rule-group" key={category.title} aria-labelledby={`rule-group-${index}`}>
            <header>
              <span className="rule-group-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h2 id={`rule-group-${index}`}>{category.title}</h2>
            </header>
            <ol>
              {category.items.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

function upvoteCountLabel(count: number | null) {
  return count === null ? "Unknown upvotes" : `${count} ${count === 1 ? "upvote" : "upvotes"}`;
}

function projectMediaStyle(colorKey: unknown): CSSProperties {
  const color = resolveTeamColor(colorKey);
  return { "--project-team-color": color.fill, "--project-team-wash": color.wash } as CSSProperties;
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
  onInteraction,
}: {
  data: View;
  run: (a: string, d: Row, options?: { errorFeedback?: "local" }) => Promise<Row>;
  onExit?: () => void;
  exitLabel?: string;
  onInteraction?: () => void;
}) {
  const initial = { ...emptyProject, ...data.project?.draft };
  const [project, setProject] = useState(initial),
    [hydrated, setHydrated] = useState(false),
    [busy, setBusy] = useState(false),
    [savingSubmission, setSavingSubmission] = useState(false),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [step, setStep] = useState(1);
  const wizardHeading = useRef<HTMLHeadingElement>(null);
  const uploadSequence = useRef({ logo: 0, banner: 0 });
  const [mediaBusy, setMediaBusy] = useState({ logo: false, banner: false });
  const [mediaInfo, setMediaInfo] = useState<Record<string, string>>({});
  const processingMedia = mediaBusy.logo || mediaBusy.banner;
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (step !== 1) wizardHeading.current?.focus();
  }, [step]);
  const next = () => {
    onInteraction?.();
    setError("");
    const issues: Record<string, string> = {};
    if (step === 1) {
      for (const [name, message] of [["projectName", "Enter a project name."], ["problemSolution", "Add a one-line summary."], ["description", "Describe your project."]])
        if (!project[name]?.trim()) issues[name] = message;
    }
    if (step === 2 && !/^https:\/\/github\.com\//.test(project.github || ""))
      issues.github = "Enter your GitHub repository URL.";
    setFieldErrors(issues);
    if (Object.keys(issues).length) {
      requestAnimationFrame(() => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`.project-editor [name="${Object.keys(issues)[0]}"]`)?.focus());
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
    onInteraction?.();
    setProject((p: Row) => ({ ...p, [name]: value }));
    setFieldErrors((previous) => { const next = { ...previous }; delete next[name]; return next; });
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
  const upload = async (file: File | undefined, kind: "logo" | "banner") => {
    if (!file) return;
    onInteraction?.();
    const sequence = ++uploadSequence.current[kind];
    setFieldErrors((previous) => { const next = { ...previous }; delete next[kind]; return next; });
    setMediaBusy((previous) => ({ ...previous, [kind]: true }));
    try {
      const image = await prepareProjectImage(file, kind);
      if (uploadSequence.current[kind] !== sequence) return;
      set(kind, image.dataUrl);
      setMediaInfo((previous) => ({ ...previous, [kind]: `${file.name} · ${image.sourceWidth} × ${image.sourceHeight}` }));
    } catch (cause) {
      if (uploadSequence.current[kind] !== sequence) return;
      setFieldErrors((previous) => ({ ...previous, [kind]: (cause as Error).message }));
    } finally {
      if (uploadSequence.current[kind] === sequence)
        setMediaBusy((previous) => ({ ...previous, [kind]: false }));
    }
  };
  const removeImage = (kind: "logo" | "banner") => {
    uploadSequence.current[kind]++;
    setMediaBusy((previous) => ({ ...previous, [kind]: false }));
    setMediaInfo((previous) => { const next = { ...previous }; delete next[kind]; return next; });
    set(kind, "");
  };
  const save = async (submit = false) => {
    onInteraction?.();
    if (!canCommit || saving.current || processingMedia) return;
    const invalidMedia = submit ? (fieldErrors.banner ? "banner" : fieldErrors.logo ? "logo" : undefined) : undefined;
    if (invalidMedia) {
      document.getElementById(`submission-${invalidMedia}-control`)?.focus();
      return;
    }
    const issues: Record<string, string> = {};
    if (submit) {
      if (!project.logo) issues.logo = "Add a project logo.";
      if (!project.banner) issues.banner = "Add a project banner.";
      if (!project.attestation) issues.attestation = "Confirm this submission is accurate.";
    }
    if (Object.keys(issues).length) {
      setFieldErrors((previous) => ({ ...previous, ...issues }));
      requestAnimationFrame(() => document.getElementById(`submission-${Object.keys(issues)[0]}-control`)?.focus());
      return;
    }
    saving.current = true;
    setSavingSubmission(submit);
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
      }, { errorFeedback: "local" });
    } catch (e) {
      if (!(e instanceof ActionCancelled)) {
        const message = (e as Error).message;
        const field = /banner/i.test(message) ? "banner" : /logo/i.test(message) ? "logo" : undefined;
        if (field) {
          setFieldErrors((previous) => ({ ...previous, [field]: message }));
          requestAnimationFrame(() => document.getElementById(`submission-${field}-control`)?.focus());
        } else setError(message);
      }
    } finally {
      saving.current = false;
      setBusy(false);
      setSavingSubmission(false);
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
    <section className="submission-v6" data-readonly={!canCommit} data-hydrated={hydrated} style={projectMediaStyle(data.team?.palette)}>
      <header className="submission-wizard-header">
        <div className="submission-heading">
          {step > 1 && canCommit ? (
            <button
              type="button"
              className="submission-back"
              aria-label="Previous submission step"
              onClick={() => {
                onInteraction?.();
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
        </div>
        <div className="submission-progress" aria-label={`Step ${step} of 3`}>
          <span className="submission-progress-bars" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <i key={n} data-active={n === step} />
            ))}
          </span>
          <span>{step} of 3</span>
        </div>
        <div className="submission-window-status">
          {(data.submissionStatus?.allowed === true || canCommit) && <span><i aria-hidden="true" />Submission window open</span>}
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
        method="post"
        inert={!hydrated}
        aria-busy={!hydrated || busy}
        onFocusCapture={onInteraction}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else void save(false);
        }}
      >
        <fieldset disabled={!canCommit || busy || !hydrated}>
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
                    aria-invalid={fieldErrors[name] ? true : undefined}
                    aria-describedby={fieldErrors[name] ? `submission-${name}-error` : undefined}
                    value={project[name]}
                    onChange={(e) => set(name, e.target.value)}
                  />
                ) : (
                  <input
                    name={name}
                    aria-required="true"
                    aria-invalid={fieldErrors[name] ? true : undefined}
                    aria-describedby={fieldErrors[name] ? `submission-${name}-error` : undefined}
                    value={project[name]}
                    onChange={(e) => set(name, e.target.value)}
                  />
                )}
                {fieldErrors[name] && <small className="submission-field-error" id={`submission-${name}-error`}>{fieldErrors[name]}</small>}
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
                  aria-invalid={fieldErrors.github ? true : undefined}
                  aria-describedby={fieldErrors.github ? "submission-github-error" : undefined}
                  value={project.github}
                  onChange={(e) => set("github", e.target.value)}
                />
              </span>
              {fieldErrors.github && <small className="submission-field-error" id="submission-github-error">{fieldErrors.github}</small>}
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
                        onInteraction?.();
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
            <ProjectMediaField kind="banner" value={project.banner} info={mediaInfo.banner} error={fieldErrors.banner} busy={mediaBusy.banner} onUpload={(file) => void upload(file, "banner")} onRemove={() => removeImage("banner")} />
            <div className="submission-media-side">
              <ProjectMediaField kind="logo" value={project.logo} info={mediaInfo.logo} error={fieldErrors.logo} busy={mediaBusy.logo} onUpload={(file) => void upload(file, "logo")} onRemove={() => removeImage("logo")} />
            </div>
            <div className="submission-attestation-wrap">
                <label className="check-label submission-attestation">
                  <input id="submission-attestation-control" type="checkbox" checked={!!project.attestation}
                    aria-required="true"
                    aria-invalid={fieldErrors.attestation ? true : undefined}
                    aria-describedby={fieldErrors.attestation ? "submission-attestation-error" : undefined}
                    onChange={(e) => set("attestation", e.target.checked)} />
                  <span>I confirm this submission is accurate.<span className="required-marker" aria-hidden="true"> *</span></span>
                </label>
                {fieldErrors.attestation && <small className="submission-field-error" id="submission-attestation-error" role="alert">{fieldErrors.attestation}</small>}
            </div>
          </div>
          {canCommit && (
            <footer className="submission-actions">
              <small className="submission-remaining">{remaining} {remaining === 1 ? "submission" : "submissions"} remaining</small>
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
                    disabled={busy || processingMedia}
                  >
                    {busy && !savingSubmission ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    className="button submission-submit"
                    disabled={busy || processingMedia}
                    aria-busy={busy && savingSubmission}
                    onClick={() => {
                      void save(true);
                    }}
                  >
                    {busy && savingSubmission ? "Submitting…" : "Submit"} <ArrowRight size={18} aria-hidden="true" />
                  </button>

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
          <p role="alert" className="submission-action-error">
            {error}
          </p>
        )}
      </form>
      {step === 3 && canCommit && <SubmissionDots />}
      {!onExit && (
        <div className="submission-history-actions">
          <ProjectHistory canRead={data.submissionAccess?.canRead === true} currentVersionId={data.project?.published_version_id} />
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
  currentVersionId,
}: {
  canRead: boolean;
  label?: string;
  currentVersionId?: string;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open || !canRead) return;
    const previous = opener.current;
    const controller = new AbortController();
    const popup = dialog.current;
    popup?.showModal();
    const stopHistory = trackDialogHistory(() => setOpen(false), previous);
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
      stopHistory();
      popup?.close();
      previous?.isConnected && previous.focus({ preventScroll: true });
    };
  }, [open, canRead]);
  if (!canRead) return null;
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={(event) => { opener.current = event.currentTarget; setOpen(true); }}
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
              aria-label="Close committed history"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>

          {busy && <div className="history-loading" role="status" aria-label="Loading committed history"><span className="sr-only">Loading committed history…</span>{[1, 2, 3].map((n) => <div key={n} aria-hidden="true"><i /><span /><span /></div>)}</div>}
          {error && <p role="alert" className="history-error">{error}</p>}
          {!busy && !error && !items.length && (
            <p className="history-empty">No committed versions yet.</p>
          )}
          {items.map((item) => (
            <CommittedSubmission item={item as { id: string; attempt: number; created_at: string }} payload={item.payload} currentVersionId={currentVersionId} key={item.id}>
              <ProjectVersion payload={item.payload} />
            </CommittedSubmission>
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
  teamColorKey,
}: {
  project: Row;
  publicView?: boolean;
  teamColorKey?: unknown;
}) {
  return (
    <div className="project-presentation" style={projectMediaStyle(teamColorKey)}>
      <img
        className="project-banner"
        src={project.banner}
        alt={`${project.projectName} project banner`}
      />
      <div className="project-overview">
      <div className="project-identity">
        <img
          className="project-logo"
          src={project.logo}
          alt={`${project.projectName} logo`}
        />
        <div>
          <h1>{project.projectName}</h1>
          {project.teamName && <p>
            {publicView ? "by " : "Team "}
            {project.teamName}
          </p>}
        </div>
      </div>
      <p className="project-description">{project.problemSolution}</p>
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
      </div>
      <div className="project-story">
        <h2>About the project</h2>
        <p className="prose">{project.description}</p>
      </div>
    </div>
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
        aria-label={`${voted ? "Upvoted" : "Upvote"} ${project.projectName}; ${upvoteCountLabel(count)}`}
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
    [hydrated, setHydrated] = useState(false),
    [page, setPage] = useState(0),
    [listing, setListing] = useState<View>(data),
    [searchBusy, setSearchBusy] = useState(false),
    [searchRetry, setSearchRetry] = useState(0),
    [searchError, setSearchError] = useState(""),
    [comment, setComment] = useState(""),
    [commentBusy, setCommentBusy] = useState(false),
    [commentError, setCommentError] = useState("");
  const board = path === "/leaderboard",
    detail = path !== "/projects" && !board,
    p = data.items?.[0];
  const highlighted = useRef(false),
    commentPending = useRef(false);
  useEffect(() => setHydrated(true), []);
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
      setSearchBusy(false);
      if (data.page) setPage(data.page);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchBusy(true);
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
      } finally {
        if (!controller.signal.aborted) setSearchBusy(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, page, data, path, detail, searchRetry]);
  const signIn = "/signin?returnTo=" + encodeURIComponent(path);
  const visibleProjects = (listing.items || []).filter((project) =>
    (project.projectName + " " + project.teamName + " " + project.problemSolution)
      .toLowerCase().includes(q.toLowerCase()),
  );
  const emptyCollection = !q && !page && !data.items?.length && !data.hasMore;
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
      <section className="projects-v6 public-project-detail" data-hydrated={hydrated}>
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
          {typeof p.slug === "string" && <ProjectShare publicPath={`/projects/${encodeURIComponent(p.slug)}`} projectName={p.projectName} />}
        </header>
        <article className="project-detail">
          <ProjectBody project={p} publicView teamColorKey={p.teamColorKey} />
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
          <section id="comments" aria-labelledby="project-comments-heading">
            <h2 id="project-comments-heading">Comments <span>{data.comments?.length || 0}</span></h2>
            {!data.comments?.length && <p className="project-empty-comments">No comments yet.</p>}
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
                method="post"
                inert={!hydrated}
                aria-busy={!hydrated || commentBusy}
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
                  disabled={commentBusy || !hydrated}
                />
                <button
                  className="project-send-comment"
                  type="submit"
                  aria-label="Post comment"
                  disabled={commentBusy || !comment.trim() || !hydrated}
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
    <section className="projects-v6 public-project-list" data-hydrated={hydrated}>
      <header className="page-heading projects-heading">
        <HeadingDot color="purple" expression="squeezed" size={64} />
        <h1>{board ? "Leaderboard" : "Projects"}</h1>
      </header>
      {!emptyCollection && <div className="project-directory-toolbar">
      <div className="project-search" inert={!hydrated}>
        <SearchIcon size={24} aria-hidden="true" />
        <Search
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(0);
            if (v.trim()) setSearchBusy(true);
          }}
          label="Search projects"
        />
      </div>
      {searchBusy && <span className="project-search-status" role="status">Searching…</span>}
      </div>}
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
        <section className="project-awards" aria-label="Unveiled awards">
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
      {searchError && <div role="alert" className="project-search-error"><span>{searchError}</span><button type="button" className="button secondary" disabled={searchBusy} onClick={() => { setSearchBusy(true); setSearchRetry((n) => n + 1); }}>Retry search</button></div>}
      <ul className="project-list" aria-busy={searchBusy}>
        {searchBusy && !visibleProjects.length && [1, 2].map((n) => <li className="project-search-placeholder" aria-hidden="true" key={`loading-${n}`}><i /><div><span /><span /><span /></div><b /><b /></li>)}
        {visibleProjects
          .map((p) => (
            <li className="public-project-card" key={p.id} id={"entry-" + p.slug} style={projectMediaStyle(p.teamColorKey)}>
              <a className="project-row-link" href={`/projects/${p.slug}`}>
                <img
                  loading="lazy"
                  decoding="async"
                  className="row-logo" style={projectMediaStyle(p.teamColorKey)}
                  src={p.logo}
                  alt=""
                />
                <div>
                  <h2>{p.projectName}</h2>
                  <p>{p.problemSolution}</p>
                  <small>by {p.teamName}</small>
                </div>
                <ChevronRight className="project-card-arrow" size={22} aria-hidden="true" />
              </a>
              <div className="public-project-card-actions">
              {board ? (
                <div className="engagement">
                  <strong>
                    {p.result
                      ? `${p.result.score} ${p.result.stage === "ai" ? "AI" : "final"} score`
                      : upvoteCountLabel(p.upvotes)}
                  </strong>
                  <a href={`/projects/${p.slug}`}>View project</a>
                </div>
              ) : (
                engagement(p)
              )}
              {typeof p.slug === "string" && <ProjectShare publicPath={`/projects/${encodeURIComponent(p.slug)}`} projectName={p.projectName} />}
              </div>
            </li>
          ))}
      </ul>
      {!visibleProjects.length && !searchBusy && !searchError && (
        <section className="project-empty-state" aria-label={q ? "No matching projects" : "No projects yet"}>
          <div className="project-empty-copy">
            <h2>{q ? "No matching projects" : "No projects yet"}</h2>
            <p>{q ? "Try another project or team name." : "Eligible team submissions appear here."}</p>
            {q ? <button className="button" type="button" onClick={() => { setQ(""); setPage(0); }}>Clear search</button> : (
              <a className="button" href={data.me?.canParticipate ? "/dashboard#project" : data.me ? "/discover/teams" : signIn}>
                {data.me?.canParticipate ? "Your workspace" : data.me ? "Meet the teams" : "Explore the portal"}<ArrowRight size={18} aria-hidden="true" />
              </a>
            )}
          </div>
          <HeadingDot color="purple" expression={q ? "sleepy" : "squeezed"} size={96} paused />
        </section>
      )}
      {(visibleProjects.length > 0 || page > 0) && <div className="form-actions project-pagination">
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
      </div>}
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
  const hydrated = useHydrated();
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
    [adding, setAdding] = useState(false),
    [actionPending, setActionPending] = useState(false),
    [quickCheckInEmail, setQuickCheckInEmail] = useState<string | null>(null);
  const pendingAction = useRef(false);
  const canManage = data.me?.owner === true || data.me?.role === "admin";
  const canCheckIn = canManage || data.me?.role === "volunteer";
  const rows = (data.items || []).map(adminParticipantProjection);
  const items = filterAdminParticipants(rows, filters).filter(
    (r) =>
      recordState === "all" ||
      (recordState === "removed" ? r.removed : !r.removed),
  );
  const viewerFilter = filters.status === "not registered";
  const [viewerPage, setViewerPage] = useState(0);
  const viewerPages = Math.max(1, Math.ceil(items.length / 25));
  const currentViewerPage = Math.min(viewerPage, viewerPages - 1);
  const displayedItems = viewerFilter ? items.slice(currentViewerPage * 25, (currentViewerPage + 1) * 25) : items;
  const selectable = items.filter((r) => !r.removed && r.viewer !== true);
  const visibleEmails = new Set(selectable.map((r) => r.email));
  const visibleSelected = selected.filter((email) => visibleEmails.has(email));
  const selectedPeople = selectable.filter((r) =>
    visibleSelected.includes(r.email),
  );
  const personalStatus = (r: Row) =>
    r.status || (r.approval === "approved" ? "Going" : "Registered");
  const checkInEligible = selectedPeople.every(
    (r) => personalStatus(r) === "Going" && !!r.id && !r.checked_in,
  );
  useEffect(() => {
    setSelected((previous) => {
      const next = previous.filter((email) => visibleEmails.has(email));
      return next.length === previous.length ? previous : next;
    });
  }, [data.items, filters, recordState]);
  const updateFilters = (value: AdminParticipantFiltersValue) => {
    setFilters(value);
    setViewerPage(0);
    setError("");
  };
  const clearFilters = () => {
    updateFilters({
      ...defaultAdminParticipantFilters,
      status: "all",
      team: "all",
    });
    setRecordState("active");
    setSelected([]);
  };
  const hasFilters = !!(
    filters.individual ||
    filters.teamQuery ||
    filters.status !== "all" ||
    filters.team !== "all" ||
    recordState !== "active"
  );
  const recordActionError = () => {
    // Portal.run keeps the full server error in its persistent action notice.
    // Preserve selection for retry without rendering the same error twice.
  };
  const runParticipantAction = async (action: string, values: Row) => {
    if (pendingAction.current) throw new ActionCancelled();
    pendingAction.current = true;
    setActionPending(true);
    setError("");
    try {
      const result = await run(action, values);
      setSelected([]);
      return result;
    } finally {
      pendingAction.current = false;
      setActionPending(false);
    }
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
              disabled={!hydrated || actionPending}
              onClick={() => setAdding(true)}
            >
              <AdminIcon name="person" />
              Add participants
            </button>
          </div>
        )}
      </header>
      {canManage && adding && (
        <AdminImportDialog
          run={runParticipantAction}
          close={() => setAdding(false)}
        />
      )}
      <div className="admin-roster-tools">
        <AdminParticipantFilters
          value={filters}
          onChange={updateFilters}
          expanded={filtersExpanded}
          showUnregistered={canManage}
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
          {items.length} {viewerFilter ? (items.length === 1 ? "viewer" : "viewers") : (items.length === 1 ? "participant" : "participants")}
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
        {hasFilters && items.length > 0 && (
          <button type="button" className="link-button" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
      {visibleSelected.length > 0 && (
        <div
          className="bulk-bar"
          role="group"
          aria-label="Selected participants"
          aria-busy={actionPending}
        >
          <strong>{visibleSelected.length} selected</strong>
          {canManage && (
            <label>
              <span className="sr-only">Individual approval status</span>
              <select
                value={status}
                disabled={actionPending}
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
              disabled={!visibleSelected.length || actionPending}
              onClick={() => {
                if (["checked", "absent"].includes(status)) {
                  const people = (data.items || []).filter((r) =>
                    visibleSelected.includes(r.email),
                  );
                  if (people.some((r) => !r.id)) {
                    setError(
                      "Selected people must sign in before a manual attendance status can be recorded.",
                    );
                    return;
                  }
                  void runParticipantAction("admin-status-bulk", {
                    userIds: people.map((r) => r.id),
                    status: status === "checked" ? "Checked in" : "Absent",
                    reason,
                  }).catch(recordActionError);
                } else
                  void runParticipantAction("participant-bulk", {
                    emails: visibleSelected,
                    status,
                    reason,
                  }).catch(recordActionError);
              }}
            >
              Update approval
            </button>
          )}
          {canCheckIn && (
            <button
              type="button"
              className="button"
              aria-label="Check in selected participants"
              aria-busy={actionPending}
              title={
                checkInEligible
                  ? "Check in selected participants"
                  : "Select Going participants with signed-in accounts to check in."
              }
              disabled={
                !visibleSelected.length ||
                !data.checkInConfigured ||
                !checkInEligible ||
                actionPending
              }
              onClick={() => {
                void runParticipantAction("bulk-check-in", {
                  emails: visibleSelected,
                }).catch(recordActionError);
              }}
            >
              <AdminIcon name="check" /> Check in
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="table-scroll">
          <table className="participants-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select visible active participants"
                    disabled={!selectable.length || actionPending}
                    checked={
                      !!selectable.length &&
                      selectable.every((r) => visibleSelected.includes(r.email))
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
                {canCheckIn && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((r) => (
                <tr key={r.email}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.email}`}
                      disabled={r.removed || r.viewer === true || actionPending}
                      checked={visibleSelected.includes(r.email)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...visibleSelected, r.email]
                            : visibleSelected.filter((x) => x !== r.email),
                        )
                      }
                    />
                  </td>
                  <td className="admin-person-cell">
                    <div className="admin-person-identity">
                      <DotAvatar
                        color={r.avatarColor || r.avatar_color || "blue"}
                        expression={
                          r.avatarExpression ||
                          r.avatar_expression ||
                          "squeezed"
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
                    <div className="admin-person-status">
                      <Pill
                        tone={
                          ["Going", "Checked in"].includes(r.status)
                            ? "positive"
                            : "neutral"
                        }
                      >
                        {personalStatus(r) === "Checked in" && (
                          <AdminIcon name="check" />
                        )}
                        {personalStatus(r)}
                      </Pill>

                    </div>
                    {r.checked_in && r.status !== "Checked in" && (
                      <small>Checked in</small>
                    )}
                  </td>
                  <td
                    className="admin-team-status-cell"
                    data-empty-team={!r.teamId}
                  >
                    <Pill
                      tone={
                        r.teamStatus === "Submitted" ? "positive" : "neutral"
                      }
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
                      <time dateTime={r.teamLockedAt}>
                        {ist(r.teamLockedAt)}
                      </time>
                    ) : (
                      <span className="admin-not-locked">Not locked</span>
                    )}
                  </td>
                  {canCheckIn && (
                    <td className="admin-manage-cell" data-empty-actions={r.viewer === true || (!canManage && (personalStatus(r) !== "Going" || !!r.checked_in || r.removed))}>
                      <div className="admin-row-actions admin-participant-action-cluster">
                      {canCheckIn &&
                        !r.removed &&
                        r.viewer !== true &&
                        personalStatus(r) === "Going" &&
                        !r.checked_in && (
                          <button
                            type="button"
                            className="button admin-quick-check-in"
                            aria-label={`Check in ${r.name || r.email}`}
                            aria-busy={quickCheckInEmail === r.email}
                            title={
                              !r.id
                                ? "Participant must sign in before check-in."
                                : "Check in participant"
                            }
                            disabled={
                              !hydrated ||
                              actionPending ||
                              !data.checkInConfigured ||
                              !r.id
                            }
                            onClick={() => {
                              if (pendingAction.current) return;
                              setQuickCheckInEmail(r.email);
                              void runParticipantAction("quick-check-in", {
                                emails: [r.email],
                              })
                                .catch(recordActionError)
                                .finally(() => setQuickCheckInEmail(null));
                            }}
                          >
                            <UserCheck size={18} aria-hidden="true" />
                            {quickCheckInEmail === r.email
                              ? "Checking in…"
                              : "Check in"}
                          </button>
                        )}
                      {canManage && (
                      r.viewer === true ? (
                        <span className="sr-only">Viewer access</span>
                      ) : r.id ? (
                        <>
                          <StatusChange
                            kind="person"
                            target={r.id}
                            name={r.name || r.email}
                            current={r.status}
                            run={runParticipantAction}
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
                              run={runParticipantAction}
                              compact
                            />
                          </StatusChange>
                        </>
                      ) : (
                        <span className="muted">
                          Account has not signed in yet.
                        </span>
                      ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewerFilter && viewerPages > 1 && (
        <nav className="viewer-pagination" aria-label="Viewer pages">
          <span>{currentViewerPage * 25 + 1}–{Math.min((currentViewerPage + 1) * 25, items.length)} of {items.length}</span>
          <button className="button secondary" type="button" disabled={currentViewerPage === 0} onClick={() => setViewerPage(currentViewerPage - 1)}>Previous</button>
          <button className="button secondary" type="button" disabled={currentViewerPage + 1 >= viewerPages} onClick={() => setViewerPage(currentViewerPage + 1)}>Next</button>
        </nav>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {!items.length && (
        <div className="admin-roster-empty" role="status">
          <p>No matches</p>
          <button type="button" className="link-button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}
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
  data: initialData,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [focused, setFocused] = useState<View | null>(null);
  const [versionBusy, setVersionBusy] = useState("");
  const [versionError, setVersionError] = useState("");
  const [accessError, setAccessError] = useState("");
  const versionRequest = useRef<AbortController | null>(null);
  const versionHeading = useRef<HTMLHeadingElement | null>(null);
  const data = focused || initialData;
  const [eligibilityStatus, setEligibilityStatus] = useState(
    data.eligibility?.status || "needs_review",
  );
  useEffect(() => {
    versionRequest.current?.abort();
    setFocused(null);
    setVersionBusy("");
    setVersionError("");
    setAccessError("");
    return () => versionRequest.current?.abort();
  }, [initialData]);
  useEffect(() => {
    setEligibilityStatus(data.eligibility?.status || "needs_review");
  }, [data.eligibility?.status]);
  useEffect(() => {
    if (focused) versionHeading.current?.focus();
  }, [focused]);
  const viewVersion = async (versionId: string) => {
    if (versionBusy || versionId === data.version?.id) return;
    const controller = new AbortController();
    versionRequest.current?.abort();
    versionRequest.current = controller;
    setVersionBusy(versionId);
    setVersionError("");
    try {
      const path = `${initialData.me?.owner || initialData.me?.role === "admin" ? "/admin/submissions/" : "/review/"}${encodeURIComponent(initialData.project.id)}`;
      const { response, body } = await readPortalView(
        `/api/portal?view=${encodeURIComponent(path)}&focus=${encodeURIComponent(versionId)}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const message = portalErrorText(body);
        if ([401, 403].includes(response.status)) setAccessError(message);
        throw new Error(message);
      }
      if (
        body.version?.id !== versionId ||
        body.project?.id !== initialData.project.id
      )
        throw new Error("This version could not be loaded. Try again.");
      setFocused(body);
    } catch (error) {
      if (!controller.signal.aborted)
        setVersionError(
          error instanceof Error
            ? error.message
            : "This version could not be loaded.",
        );
    } finally {
      if (!controller.signal.aborted) setVersionBusy("");
    }
  };
  if (accessError)
    return (
      <p role="alert" className="results-ui-error">
        {accessError}
      </p>
    );
  const p = data.project,
    v = data.version;
  if (!p) return <Empty>Select a submitted project.</Empty>;
  const payload = v?.payload || p.draft || {},
    staff = data.me?.owner || data.me?.role === "admin";
  const current = data.selectedIsCurrent !== false;
  const ownReview = (data.history || []).find(
    (item: Row) => item.author_id === data.me?.id && item.version_id === v?.id,
  );
  const versions: Row[] = data.versions || (v ? [v] : []);
  const github = safeExternalUrl(payload.github),
    demo = safeExternalUrl(payload.demo);
  const repository = github
    ? new URL(github).pathname.replace(/^\//, "").replace(/\/$/, "")
    : "";
  const recordedTools = Array.isArray(payload.ecosystemSelections)
    ? payload.ecosystemSelections.filter(
        (value: unknown) => typeof value === "string",
      )
    : typeof payload.tools === "string" && payload.tools.trim()
      ? payload.tools
          .split(/[\n,]/)
          .map((value: string) => value.trim())
          .filter(Boolean)
      : null;
  const answer = (value: unknown) =>
    typeof value === "string" && value.trim() ? (
      value
    ) : (
      <span className="results-ui-unavailable">
        Unavailable in this version
      </span>
    );
  return (
    <section className="admin-exact admin-workspace results-ui-review">
      <header className="results-ui-reviewHeader">
        <Link
          className="results-ui-back"
          href={staff ? "/admin/submissions" : "/review"}
          aria-label="Back"
        >
          <ArrowLeft size={21} aria-hidden="true" />
        </Link>
        <div className="results-ui-reviewHeading">
          <span>{p.teamName || "Project review"}</span>
          <h1 ref={versionHeading} tabIndex={-1}>{payload.projectName || "Untitled project"}</h1>
        </div>
        {v && (
          <span className="results-ui-status">
            v{v.attempt}
            {!current ? " · Historical" : " · Current"}
          </span>
        )}
      </header>
      {!current && (
        <p className="results-ui-historical">
          Viewing a previous submission. Review actions apply to the current
          version.
        </p>
      )}
      <div className="results-ui-reviewGrid">
        <article className="results-ui-projectPanel">
          {(payload.logo || payload.banner) && (
            <div className="results-ui-projectMedia">
              {payload.logo && (
                <img
                  className="results-ui-projectLogo"
                  src={payload.logo}
                  alt=""
                  width={72}
                  height={72}
                />
              )}
              {payload.banner && (
                <img
                  className="results-ui-projectBanner"
                  src={payload.banner}
                  alt=""
                />
              )}
            </div>
          )}
          {(github || demo) && (
            <div className="results-ui-projectLinks">
              {github && (
                <a href={github} target="_blank" rel="noopener noreferrer">
                  <img
                    src="/icons/social/github.svg"
                    width={18}
                    height={18}
                    alt=""
                  />
                  <span>{repository || new URL(github).hostname}</span>
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              )}
              {demo && (
                <a href={demo} target="_blank" rel="noopener noreferrer">
                  <Link2 size={18} aria-hidden="true" />
                  <span>{new URL(demo).hostname}</span>
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
          <dl className="results-ui-answers">
            <div>
              <dt>What problem does your project solve?</dt>
              <dd>{answer(payload.problemSolution)}</dd>
            </div>
            <div>
              <dt>Describe your project</dt>
              <dd>{answer(payload.description)}</dd>
            </div>
            <div>
              <dt>Which OpenAI ecosystem tools did you use?</dt>
              <dd>
                {recordedTools ? (
                  recordedTools.length ? (
                    <ul className="results-ui-toolList">
                      {recordedTools.map((tool: string, index: number) => (
                        <li key={`${tool}-${index}`}>{tool}</li>
                      ))}
                    </ul>
                  ) : (
                    "None selected"
                  )
                ) : (
                  <span className="results-ui-unavailable">
                    Unavailable in this version
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Did you integrate Cerebras?</dt>
              <dd>
                {payload.cerebrasIntegration === "yes" ? (
                  "Yes"
                ) : payload.cerebrasIntegration === "no" ? (
                  "No"
                ) : (
                  <span className="results-ui-unavailable">
                    Unavailable in this version
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {staff && current && (
            <details className="results-ui-reviewDetails">
              <summary>Manage project</summary>
              <AdminProjectActions
                key={`${p.id}-${p.deleted_at || "active"}-${JSON.stringify(versions)}`}
                {...adminProjectProjection(p, versions)}
                run={run}
              />
            </details>
          )}
        </article>
        <aside className="results-ui-reviewAside">
          {current && (
            <Form
              key={`${p.id}-${v?.id || "draft"}`}
              className="results-ui-card results-ui-scoreForm"
              title={
                data.reviewKind === "mentor" ? "Private advice" : "Your score"
              }
              label="Save"
              disabled={!v || !current}
              onSave={async (f) => {
                await run(
                  "review-project",
                  privateReviewValues(f, data.reviewKind, p.id, v?.id),
                );
              }}
            >
              {["admin", "judge"].includes(data.reviewKind) && (
                <fieldset className="results-ui-rating">
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
                value={ownReview?.body || ""}
                required={!["admin", "judge"].includes(data.reviewKind)}
              />
              {!v && (
                <p className="results-ui-reason">
                  A committed version is required.
                </p>
              )}
            </Form>
          )}
          {current && (staff || data.canRestoreEligibility) && v && (
            <Form
              className="results-ui-card results-ui-eligibility"
              title="Eligibility"
              label="Update eligibility"
              disabled={!current || data.resultsFrozen === true}
              onSave={async (f) => {
                await run("set-project-eligibility", {
                  projectId: p.id,
                  versionId: v.id,
                  status: f.get("status"),
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
              <select
                name="status"
                aria-label="Eligibility"
                value={eligibilityStatus}
                onChange={(event) => setEligibilityStatus(event.target.value)}
              >
                <option value="needs_review">Checks pending</option>
                <option value="eligible">Eligible</option>
                <option value="ineligible">Ineligible</option>
              </select>
              {eligibilityStatus === "ineligible" && (
                <>
                  <Field name="rule" label="Rule" required minLength={5} />
                  <Field
                    name="evidence"
                    label="Private evidence"
                    type="textarea"
                    required
                    minLength={10}
                  />
                </>
              )}
              {data.resultsFrozen && (
                <p className="results-ui-reason">Final scores are frozen.</p>
              )}
            </Form>
          )}
          {current && <PrivateAIEvaluation data={data} run={run} />}
          <details className="results-ui-card results-ui-reviewDetails">
            <summary>
              Versions <span>{versions.length} / 3</span>
            </summary>
            <ul className="results-ui-versions">
              {versions.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>v{item.attempt}</strong>
                    <span>
                      {item.deleted_at ? "Removed" : "Committed"}
                      {item.created_at ? ` · ${ist(item.created_at)}` : ""}
                    </span>
                  </div>
                  {item.id === v?.id ? (
                    <span className="results-ui-meta">Viewing</span>
                  ) : (
                    <button
                      type="button"
                      className="results-ui-versionButton"
                      disabled={!!versionBusy}
                      onClick={() => void viewVersion(item.id)}
                    >
                      {versionBusy === item.id ? "Loading…" : "View"}
                      <span className="sr-only"> version {item.attempt}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {versionError && (
              <p className="results-ui-error" role="alert">
                {versionError}
              </p>
            )}
          </details>
          <details className="results-ui-card results-ui-reviewDetails">
            <summary>Private review history</summary>
            {(data.history || []).length ? (
              data.history.map((item: Row) => (
                <article className="results-ui-history" key={item.id}>
                  <header>
                    <strong>
                      {item.author} · {item.kind}
                    </strong>
                    {item.rating != null && <span>{item.rating} / 10</span>}
                  </header>
                  {item.body && <p>{item.body}</p>}
                  <small>{ist(item.created_at)}</small>
                </article>
              ))
            ) : (
              <p className="results-ui-reason">No reviews yet.</p>
            )}
          </details>
        </aside>
      </div>
    </section>
  );
}
function AdminTeamIdea({
  team,
  run,
}: {
  team: Row;
  run: (action: string, values: Row) => Promise<Row>;
}) {
  const [description, setDescription] = useState(
    String(team.idea?.description || ""),
  );
  if (!team.idea) return <p className="admin-team-no-idea">No saved idea.</p>;
  return (
    <details className="admin-team-idea">
      <summary>
        <span>Team idea</span>
        {team.locked ? (
          <LockKeyhole size={16} aria-label="Locked" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </summary>
      <Form
        className="admin-team-idea-form"
        label={team.locked ? "Override idea" : "Save idea"}
        onSave={async (form) => {
          await run("admin-idea-override", {
            teamId: team.id,
            title: form.get("title"),
            description: description.trim(),
            confirmation: "OVERRIDE_TEAM_IDEA",
          });
        }}
      >
        <Field
          name="title"
          label="Idea title"
          value={team.idea.title}
          required
          minLength={2}
        />
        <label>
          <span>
            Description{" "}
            <span className="required-mark" aria-hidden="true">
              *
            </span>
          </span>
          <textarea
            name="description"
            aria-label="Description"
            required
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
          <small>{description.length}/500</small>
        </label>
      </Form>
    </details>
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
        <AdminCreditBatches batches={data.creditBatches || []} categories={items as any} run={run} />
      ) : teams ? (
        <ul className="admin-team-list">
          {items.map((team) => (
            <AdminTeamCard
              key={team.id}
              name={team.name}
              defaultOpen={Boolean(team.locked)}
              avatar={<TeamAvatar name={team.name} palette={team.palette} size={48} />}
              caption={<>{team.status} · {team.readiness?.total ? `${team.readiness.approved}/${team.readiness.total} approved` : `${team.members.length} members`}</>}
              menu={<StatusChange kind="team" target={team.id} name={team.name} current={team.status} run={run} compact>{(data.me?.owner || data.me?.role === "admin") && <AdminTeamActions team={team as { id: string; name: string; members: unknown[] }} run={run} />}</StatusChange>}
            >
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
                {(data.me?.owner || data.me?.role === "admin") && (
                  <AdminTeamIdea
                    key={`${team.id}-${team.idea?.title}-${team.idea?.description}`}
                    team={team}
                    run={run}
                  />
                )}
            </AdminTeamCard>
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
                      <span>
                        {record.deleted_at
                          ? "Removed project · manage restoration"
                          : "Manage project and submissions"}
                      </span>
                      <ChevronDown size={18} aria-hidden="true" />
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
  const hydrated = useHydrated();
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
        method="post"
        inert={!hydrated}
        data-hydrated={hydrated}
        aria-busy={!hydrated || !!busy}
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
          disabled={!hydrated || !!busy}
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
              disabled={!hydrated || !!busy || (!dirty && !!record?.revision)}
            >
              <SaveIcon size={18} aria-hidden="true" focusable="false" />
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!hydrated || !!busy || dirty || !record?.revision}
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
          aria-label="Provider"
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
        {section === "results" && data.me?.owner && (
          <JudgingSettings key={`judging-${data.policyVersion}`} data={data} run={run} />
        )}
        <ResultVisibility data={data} run={run} />
      </div>
      <div {...panel("access")}>
        <AddAdmins owner={!!data.me?.owner} title="Admin access" access={data.adminAccess} run={run} />
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
  initialFailure,
  pendingPath = null,
  onNavigate,
}: {
  path: string;
  localTest?: boolean;
  initialPublic?: View;
  initialView?: View;
  initialFailure?: PortalLoadFailure;
  pendingPath?: string | null;
  onNavigate?: (event: { preventDefault(): void }, destination: string, options?: { replace?: boolean }) => void;
}) {
  const hydrated = useHydrated();
  const path = canonical(original);
  function navigate(event: { preventDefault(): void }, destination: string) {
    if (!onNavigate || canonical(destination) === path) return;
    const replace = consumeDialogHistoryForNavigation();
    setMenu(false);
    onNavigate(event, destination, { replace });
  }
  const [data, setData] = useState<View>(initialView || initialPublic || {}),
    [loading, setLoading] = useState(!initialView && !initialPublic && !initialFailure && path !== "/"),
    [error, setError] = useState(initialFailure?.message || ""),
    [errorCode, setErrorCode] = useState(initialFailure?.code || ""),
    [refreshing, setRefreshing] = useState(false),
    [message, setMessage] = useState(""),
    [messageTone, setMessageTone] = useState<"success" | "error">("success"),
    [menu, setMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<SubmissionSuccessState | null>(null);
  const gate = useRef<ConfirmationGate | null>(null),
    actionBusy = useRef(false),
    mutationKeys = useRef(new Set<string>()),
    loadGeneration = useRef(0),
    loadAbort = useRef<AbortController | null>(null),
    lastRefresh = useRef(0),
    hasLoadedView = useRef(!!initialView || !!initialPublic),
    presentationCache = useRef(new AdminPresentationCache());
  if (!gate.current) gate.current = new ConfirmationGate(setConfirmation);
  useEffect(() => {
    if (!message || messageTone !== "success") return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message, messageTone]);
  async function load() {
    const generation = ++loadGeneration.current;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    lastRefresh.current = Date.now();
    setRefreshing(true);
    setLoading(!hasLoadedView.current);
    try {
      const focus=new URLSearchParams(window.location.search).get("project") || "";
      const options={search:"",page:0,focus};
      const version=await presentationCache.current.knownVersion(path,data.me,options);
      const url=`/api/portal?view=${encodeURIComponent(path)}&focus=${encodeURIComponent(focus)}`;
      let {response: r,body}=await readPortalView(url+(version?"&presentation="+encodeURIComponent(version):""),controller.signal);
      if (generation !== loadGeneration.current) return;
      if (!r.ok) {
        presentationCache.current.clear();
        const failure = portalLoadFailure(r.status, body);
        setErrorCode(failure.code);
        if (r.status === 401 || r.status === 403) {
          hasLoadedView.current = false;
          setData({});
        }
        throw new Error(failure.message);
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
      setError("");
      hasLoadedView.current = true;
      setData(hydrated);
      return hydrated;
    } catch (e) {
      if (generation === loadGeneration.current && !controller.signal.aborted) {
        if (e instanceof TypeError || e instanceof SyntaxError) {
          setErrorCode("LOAD_FAILED");
          setError(e instanceof SyntaxError ? "The portal returned an unreadable response. Try again." : "Unable to reach the portal. Check your connection and try again.");
        } else setError((e as Error).message);
      }
    } finally {
      if (generation === loadGeneration.current) { setLoading(false); setRefreshing(false); }
      if (loadAbort.current === controller) loadAbort.current = null;
    }
  }
  useEffect(() => {
    setMessage("");
    setSubmissionSuccess(null);
    setRefreshing(false);
    setError(initialFailure?.message || "");
    setErrorCode(initialFailure?.code || "");
    if (initialFailure) {
      setData({});
      hasLoadedView.current = false;
      setLoading(false);
      lastRefresh.current = Date.now();
    } else if (initialView) {
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
  }, [path, initialView, initialPublic, initialFailure]);
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
  const clearSuccessNotice = () => {
    if (messageTone === "success") setMessage("");
  };
  const run = async (action: string, values: Row, options?: { errorFeedback?: "local" }) => {
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
      const { newCount: _count, singleEmail: _email, windowWarnings: _windowWarnings, creditImportSummary: _creditSummary, ...payload } = values;
      setMessage("");
      const result = await api(
        action,
        token ? { ...payload, confirmation: token } : payload,
      );
      setMessageTone("success");
      if (action !== "submit-project") setMessage(portalSuccessText(action, result.message));
      const fresh = await load();
      if (action === "submit-project") setSubmissionSuccess(submittedProjectSuccess(result, fresh));
      return result;
    } catch (e) {
      if (!(e instanceof ActionCancelled) && options?.errorFeedback !== "local") {
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
  const loadErrorTitle = errorCode === "SIGN_IN_REQUIRED" || errorCode === "AUTH_REQUIRED" ? "Sign in to continue" : "This page could not load";
  const publicBrowse = path.startsWith("/projects") || path === "/leaderboard";
  const workspaceShell = path !== "/" && !publicBrowse && !profileOnboarding;
  const studioDashboard = path === "/dashboard" && !profileOnboarding;
  const c =
    teamPalettes[(data.team?.palette || "forest") as Palette] ||
    teamPalettes.forest;
  return (
    <div
      className={`app-shell navigation-shell ${path === "/" ? "public-home-shell" : ""} ${profileOnboarding ? "onboarding-shell" : ""} ${workspaceShell ? "workspace-shell" : ""} ${publicBrowse ? "public-project-shell" : ""} ${studioDashboard ? "studio-dashboard-shell" : ""}`.trim()}
      data-hydrated={hydrated}
      style={{ "--team-accent": c.ink, "--team-wash": c.wash } as CSSProperties}
    >
      {confirmation && (
        <ConfirmationDialog
          value={confirmation}
          decide={(yes) => gate.current?.decide(yes)}
        />
      )}
      {submissionSuccess && <ProjectSubmissionSuccess value={submissionSuccess} onClose={() => setSubmissionSuccess(null)} />}

      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <NavigationHeader
        open={menu}
        hydrated={hydrated}
        onOpen={() => setMenu(true)}
        account={data.me}
        accountHref={data.me ? privileged || data.me.role === "volunteer" || data.me.mode === "viewer" ? "/dashboard" : "/profile" : undefined}
        accountLabel={data.me ? data.me.mode === "viewer" ? "Viewer mode" : privileged || data.me.role === "volunteer" ? "Your Dashboard" : "Your profile" : undefined}
      />
      <MobileNavigation open={menu} onClose={() => setMenu(false)}>
        {nav.map(([href, label]) => (
          <Link prefetch={false} key={href} href={href} onNavigate={(event) => navigate(event, href)} aria-current={path === href || (href === "/discover/teams" && path === "/discover/participants") ? "page" : undefined}><Icon name={navigationIcon(label)} />{label}</Link>
        ))}
        {!data.me ? (
          <a href="/signin?returnTo=%2Fdashboard" target="_top"><Icon name="person" />Sign in</a>
        ) : (
          <>
            {data.me.mode !== "viewer" && <Link prefetch={false} href="/profile" onNavigate={(event) => navigate(event, "/profile")}><Icon name="person" />Your profile</Link>}
            {(privileged || data.me.role === "volunteer") && (
              <Link prefetch={false} href={admin ? "/dashboard" : "/admin/participants"} onNavigate={(event) => navigate(event, admin ? "/dashboard" : "/admin/participants")}>
                <Icon name={admin ? "dashboard" : "settings"} />
                {admin ? "Workspace" : "Administration"}
              </Link>
            )}
            {data.me.mode !== "viewer" && <Link prefetch={false} href="/personal/credits" onNavigate={(event) => navigate(event, "/personal/credits")} aria-current={path === "/personal/credits" ? "page" : undefined}><Icon name="credits" />My credits</Link>}
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
          <section className="page-error-card" role="alert" aria-busy={refreshing}>
            <HeadingDot color="orange" expression="sleepy" size={48} paused />
            <h1>{loadErrorTitle}</h1>
            {error.trim().replace(/[.!]$/, "") !== loadErrorTitle && <p>{error}</p>}
            <div className="form-actions">
            <button
              className="button secondary"
              disabled={refreshing}
              onClick={() => {
                void load();
              }}
            >
              {refreshing ? "Trying again…" : "Try again"}
            </button>
            {!data.me && (
              <a className="button" target="_top" href={`/signin?returnTo=${encodeURIComponent(path)}`}>Sign in</a>
            )}
            </div>
          </section>
        )}
        {(!error || path === "/") && (pendingPath ? (
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
              {data.me?.mode === "viewer" && ["/dashboard", "/profile", "/submission", "/personal/credits"].includes(path) ? (
                <ViewerWelcome removed={!!data.me.deactivated} />
              ) : data.profileIncomplete &&
              data.me?.mode !== "viewer" &&
              (path === "/dashboard" || path === "/profile") ? (
                <Profile data={data} run={run} gated />
              ) : path === "/profile" ? (
                data.me?.mode === "viewer" ? (
                  <Dashboard data={data} run={run} onInteraction={clearSuccessNotice} />
                ) : (
                  <Profile data={data} run={run} />
                )
              ) : path === "/rules" ? (
                <SharedRules categories={data.categories || []} />
              ) : path === "/personal/credits" ? (
                <PersonalCredits data={data} />
              ) : path === "/dashboard" ? (
                <Dashboard data={data} run={run} onInteraction={clearSuccessNotice} />
              ) : path === "/discover/teams" ||
                path === "/discover/participants" ? (
                <Discover data={data} path={path} run={run} />
              ) : path === "/submission" ? (
                <Submission
                  key={`${data.project?.revision || 0}-${data.team?.id || "none"}`}
                  data={data}
                  run={run}
                  onInteraction={clearSuccessNotice}
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
        ))}
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
          key={`${kind}:${target}:${current}`}
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
