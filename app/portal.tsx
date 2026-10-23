"use client";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search as SearchIcon,
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
} from "lucide-react";
import AddAdmins from "./add-admins";
import { HeadingDot } from "./expressive-heading";
import CenteredLoader from "./centered-loader";
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
import OwnerOperationalSetup from "./owner-operational-setup";
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
  useState,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import Home from "./home";
import ProfileFlow from "./profile-flow";
import AdminImportDialog from "./admin-import-dialog";
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
  const id =
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
  | "team";
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Component = {
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
      {label}
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
}: {
  title?: string;
  children: ReactNode;
  onSave: (data: FormData) => Promise<void>;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={className}
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
        <button className="button" disabled={busy || disabled}>
          {busy ? "Saving…" : label}
        </button>
      </div>
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
      <fieldset>
        <legend>Team color</legend>
        <div className="palette-picker">
          {teamColorKeys.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="palette"
                value={key}
                checked={palette === key}
                onChange={() => setPalette(key)}
              />
              <span
                className="palette-swatch"
                style={{ background: teamDotColors[key] }}
              />
              {teamColorLabels[key]}
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
      title="Start your team"
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
      <label>
        Team name
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <Field
        name="bio"
        label="What would you like to build? · optional"
        type="textarea"
      />
      <AvatarChooser name={name} {...{ palette, setPalette }} />
    </Form>
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
    <details className="panel">
      <summary>Customize your team badge and accent</summary>
      <Form
        className="inset-form"
        onSave={async () => {
          await run("team-style", { avatar: "initials", palette });
        }}
        label="Update team identity"
      >
        <AvatarChooser name={team.name} {...{ palette, setPalette }} />
      </Form>
    </details>
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
  if (!t)
    return (
      <section className="panel dashboard-empty-team">
        <h3>Find your team</h3>
        <a className="button secondary" href="/discover/teams">
          Discover teams
        </a>
        {data.me?.canParticipate === true && <CreateTeam run={run} />}
      </section>
    );
  return (
    <section className="team-workspace dashboard-team">
      <div className="dashboard-team-heading">
        <TeamAvatar name={t.name} palette={t.palette} size={64} />
        <h3>{t.name}</h3>
        <Pill tone={locked ? "locked" : "neutral"}>
          {locked && <LockKeyhole size={18} aria-hidden="true" />}
          {locked ? "Locked" : data.teamStatus || "Forming"}
        </Pill>
      </div>
      {data.privateVenue && <DashboardVenue venue={data.privateVenue} />}
      <section
        className="dashboard-members"
        aria-labelledby="dashboard-members-heading"
      >
        <h3 id="dashboard-members-heading">
          Team members ({data.members?.length || 0})
        </h3>
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
              </div>
              {m.role === "leader" && <Pill tone="positive">Leader</Pill>}
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
                  <span className="dashboard-member-phone">
                    <Phone size={17} aria-hidden="true" />
                    {m.phone}
                  </span>
                )}
                {leader && !locked && m.role !== "leader" && (
                  <button
                    type="button"
                    className="dashboard-icon-button dashboard-remove"
                    aria-label={`Remove ${m.name} from team`}
                    title={`Remove ${m.name}`}
                    onClick={() => {
                      void run("remove-workspace-member", {
                        userId: m.id,
                        reason: "Team leader removed membership",
                      }).catch(() => {});
                    }}
                  >
                    <Trash2 size={19} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="dashboard-idea"
        aria-labelledby="dashboard-idea-heading"
      >
        <h3 id="dashboard-idea-heading">
          Team idea{locked ? " (locked)" : ""}
        </h3>
        {leader && !locked ? (
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
                Short description
                <textarea
                  name="description"
                  required
                  maxLength={500}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-describedby="idea-count"
                />
                <small id="idea-count">
                  {description.length}/500 characters
                </small>
              </label>
            </fieldset>
          </Form>
        ) : data.idea ? (
          <div className="dashboard-locked-idea">
            <div>
              <h4>{data.idea.title}</h4>
              {locked && <LockKeyhole size={18} aria-label="Locked" />}
            </div>
            <p className="prose">{data.idea.description}</p>
            <span className="dashboard-idea-count">
              {String(data.idea.description || "").length}/500
            </span>
          </div>
        ) : (
          <p>No team idea yet.</p>
        )}
        {leader && !locked && (
          <div className="form-actions dashboard-lock-actions">
            <button
              className="button secondary"
              disabled={
                !data.idea?.title?.trim() || !data.idea?.description?.trim()
              }
              onClick={() => {
                void run("lock-team", { confirmation: "LOCK_TEAM" }).catch(
                  () => {},
                );
              }}
            >
              <LockKeyhole size={18} aria-hidden="true" />
              Lock completed team
            </button>
          </div>
        )}
      </section>
      {leader && !locked && (
        <div className="dashboard-team-controls">
          <details className="panel">
            <summary>Rename team</summary>
            <Form
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
          </details>
          <details className="panel">
            <summary>Membership requests</summary>
            {(data.actions || [])
              .filter(
                (r: Row) =>
                  r.kind === "request" &&
                  r.status === "pending" &&
                  r.team_id === t.id,
              )
              .map((r: Row) => (
                <div className="request-row" key={r.id}>
                  <strong>{r.person_name}</strong>
                  <button
                    className="button secondary"
                    onClick={() => {
                      void run("respond-team", {
                        requestId: r.id,
                        accept: true,
                      }).catch(() => {});
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="link-button"
                    onClick={() => {
                      void run("respond-team", {
                        requestId: r.id,
                        accept: false,
                      }).catch(() => {});
                    }}
                  >
                    Decline
                  </button>
                </div>
              ))}
          </details>
          <TeamStyle team={t} run={run} />
          {data.members?.length === 1 && (
            <details className="panel">
              <summary>Delete your team</summary>
              <Form
                label="Review team deletion"
                onSave={async (f) => {
                  await run("delete-own-team", {
                    reason: f.get("reason"),
                    confirmation: "DELETE_OWN_TEAM",
                  });
                }}
              >
                <Field
                  name="reason"
                  label="Reason for deleting your team"
                  required
                  minLength={5}
                />
              </Form>
            </details>
          )}
        </div>
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
        <p className="notice">
          {data.submissionAccess?.message ||
            "Your project workspace is not available yet."}
        </p>
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
        {!data.credits?.length && <p>No credits assigned.</p>}
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
  const hashOpened = useRef("");
  const participants = path === "/discover/participants";
  const canCreate = data.me?.canParticipate === true && !data.team;
  useEffect(() => {
    if (!participants) return;
    const openHash = () => {
      const hash = window.location.hash;
      if (!/^#person-[A-Za-z0-9_-]+$/.test(hash)) return;
      const row = (data.items || []).find(
        (person: Row) => `#person-${person.id}` === hash,
      );
      if (!row || hashOpened.current === hash) return;
      hashOpened.current = hash;
      document
        .getElementById(`person-${row.id}`)
        ?.scrollIntoView({ block: "center", behavior: "auto" });
      setSelectedPerson(discoveryProfileProjection(row));
    };
    // Data refreshes must not reopen a dismissed dialog. A new hash navigation
    // is an explicit request, including returning to a previously viewed person.
    const navigateHash = () => {
      hashOpened.current = "";
      openHash();
    };
    openHash();
    window.addEventListener("hashchange", navigateHash);
    return () => window.removeEventListener("hashchange", navigateHash);
  }, [participants, data.items]);
  const items = (data.items || []).filter(
    (row) =>
      `${row.name || ""} ${row.teamName || ""} ${row.bio || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!participants ||
        !teamFilter ||
        (teamFilter === "in" ? !!row.teamName : !row.teamName)),
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
        className={`discover-directory ${participants ? "discover-people" : "discover-teams"}`}
      >
        {items.map((row) => (
          <li key={row.id} id={participants ? `person-${row.id}` : undefined}>
            {participants ? (
              <>
                <DotAvatar
                  color={row.avatarColor}
                  expression={row.avatarExpression}
                  size={56}
                  decorative
                />
                <div className="discover-identity">
                  <h2>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPerson(discoveryProfileProjection(row))
                      }
                      aria-haspopup="dialog"
                    >
                      {row.name}
                    </button>
                  </h2>
                  {row.bio && <p>{row.bio}</p>}
                </div>
                <span
                  className={`discover-membership ${row.teamName ? "joined" : "unjoined"}`}
                >
                  {row.teamName ? "In a team" : "Not in a team"}
                </span>
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
                  <h2>{row.name}</h2>
                  <p>{row.readiness?.total ?? "?"}/5 members</p>
                </div>
                <span
                  className={`discover-state ${row.locked ? "locked" : "forming"}`}
                >
                  {row.status || (row.locked ? "Locked" : "Forming")}
                </span>
                <div className="discover-team-action">
                  {data.team?.id === row.id ? (
                    <a href="/dashboard" className="discover-view-team">
                      Your team
                    </a>
                  ) : canCreate &&
                    !row.locked &&
                    Number(row.readiness?.total) < 5 ? (
                    <button
                      type="button"
                      className="discover-request"
                      disabled={!!row.requested}
                      onClick={() => {
                        void run("request-team", { teamId: row.id }).catch(
                          () => {},
                        );
                      }}
                    >
                      {row.requested ? "Requested" : "Request to join"}
                    </button>
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
      </ul>
      {!items.length && (
        <p className="discover-empty">
          {search || teamFilter
            ? "No matches"
            : participants
              ? "No people yet"
              : "No teams yet"}
        </p>
      )}
      {!participants && canCreate && (
        <details className="discover-create">
          <summary>
            <Plus size={20} aria-hidden="true" />
            Create team
          </summary>
          <CreateTeam run={run} />
        </details>
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
      previous?.isConnected && previous.focus();
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
  const signIn = "/signin-with-chatgpt?return_to=" + encodeURIComponent(path);
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
export function AdminParticipants({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [filters, setFilters] = useState<AdminParticipantFiltersValue>({
      ...defaultAdminParticipantFilters,
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
    <section className="admin-exact admin-participants-page">
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
      <div className="admin-mobile-tools">
        <Search
          value={filters.individual}
          onChange={(individual) =>
            updateFilters({ ...filters, individual, teamQuery: "" })
          }
          label="Name, email or team"
        />
        <button
          className="admin-toolbar-icon"
          aria-label="Participant filters"
          aria-expanded={filtersExpanded}
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <AdminIcon name="filter" />
        </button>
        {canManage && (
          <a
            className="admin-toolbar-icon"
            aria-label={`Export filtered participants (${items.length})`}
            href={participantExportHref(filters, recordState)}
          >
            <AdminIcon name="download" />
          </a>
        )}
      </div>
      <AdminParticipantFilters
        value={filters}
        onChange={updateFilters}
        expanded={filtersExpanded}
      />
      <div
        className={`toolbar admin-participant-record-tools${filtersExpanded ? " is-expanded" : ""}`}
      >
        <details className="admin-record-disclosure">
          <summary>
            <AdminIcon name="filter" />
            <span>Records</span>
          </summary>
          <label>
            Participation record
            <select
              value={recordState}
              onChange={(e) => {
                setRecordState(e.target.value as ParticipantRecordState);
                setSelected([]);
                if (e.target.value === "removed")
                  setFilters({ ...filters, status: "all", team: "all" });
              }}
            >
              <option value="active">Active</option>
              <option value="removed">Removed</option>
              <option value="all">All records</option>
            </select>
          </label>
        </details>
        {canManage && (
          <a
            className="button secondary"
            aria-label={`Export filtered participants (${items.length})`}
            href={participantExportHref(filters, recordState)}
          >
            <AdminIcon name="download" />
            <span className="admin-export-label">Export ({items.length})</span>
          </a>
        )}
      </div>

      {canManage && (
        <button
          className="button admin-mobile-add"
          type="button"
          onClick={() => setAdding(true)}
        >
          <AdminIcon name="person" />
          Add participants
        </button>
      )}
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
                <td>
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
                <td>
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
                <td>
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
                <td>
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
                    "Not locked"
                  )}
                </td>
                {canManage && (
                  <td>
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
      {!items.length && (
        <Empty>
          No participants match these combined filters. Change the status or
          team filter to see other records.
        </Empty>
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
      className="admin-exact admin-review-page"
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
      className={`admin-exact admin-list-page${teams ? " admin-teams-page" : logs ? " admin-logs-page" : credits ? " admin-credits-page" : " admin-submissions-page"}`}
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
      {!items.length && <Empty>No records match this view.</Empty>}
    </section>
  );
}
function ContentEditor({
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
  const [content, setContent] = useState<Row>(initial);
  const dirty = JSON.stringify(content) !== JSON.stringify(initial);
  const update = (k: string, v: unknown) =>
    setContent((p) => ({ ...p, [k]: v }));
  return (
    <Form
      title={
        scope === "public" ? "Public event content" : "Private arrival details"
      }
      label="Save draft"
      onSave={async (f) => {
        await run("content-save", {
          scope,
          revision: record?.revision || 0,
          content,
          reason: f.get("reason"),
        });
      }}
    >
      {scope === "public" ? (
        <>
          <h3>Agenda</h3>
          {(content.agenda || []).map((a: Row, i: number) => (
            <fieldset key={i}>
              <legend>Agenda entry {i + 1}</legend>
              {["time", "title", "description"].map((k) => (
                <label key={k}>
                  {k}
                  <input
                    value={a[k]}
                    onChange={(e) =>
                      update(
                        "agenda",
                        content.agenda.map((x: Row, j: number) =>
                          j === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  update(
                    "agenda",
                    content.agenda.filter((_: Row, j: number) => j !== i),
                  )
                }
              >
                Remove entry
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              update("agenda", [
                ...(content.agenda || []),
                { time: "", title: "", description: "" },
              ])
            }
          >
            Add agenda entry
          </button>
          <h3>Frequently asked questions</h3>
          {(content.faqs || []).map((f: Row, i: number) => (
            <fieldset key={i}>
              <legend>Question {i + 1}</legend>
              {["question", "answer"].map((k) => (
                <label key={k}>
                  {k}
                  <textarea
                    value={f[k]}
                    onChange={(e) =>
                      update(
                        "faqs",
                        content.faqs.map((x: Row, j: number) =>
                          j === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  update(
                    "faqs",
                    content.faqs.filter((_: Row, j: number) => j !== i),
                  )
                }
              >
                Remove question
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              update("faqs", [
                ...(content.faqs || []),
                { question: "", answer: "" },
              ])
            }
          >
            Add question
          </button>
          <label>
            Rules · plain text
            <textarea
              rows={7}
              value={content.rules || ""}
              onChange={(e) => update("rules", e.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          {[
            ["location", "Exact room or entry location"],
            ["directions", "Private directions"],
            ["mapUrl", "Private Google Maps URL"],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              {k === "directions" ? (
                <textarea
                  value={content[k] || ""}
                  onChange={(e) => update(k, e.target.value)}
                />
              ) : (
                <input
                  type={k === "mapUrl" ? "url" : "text"}
                  value={content[k] || ""}
                  onChange={(e) => update(k, e.target.value)}
                />
              )}
            </label>
          ))}
        </>
      )}
      <Field
        name="reason"
        label="Reason for this content change"
        required
        minLength={5}
      />
      <button
        type="button"
        className="button secondary"
        disabled={dirty || !record?.revision}
        onClick={() => {
          void run("content-publish", {
            scope,
            revision: record.revision,
            reason: "Owner published the saved content draft",
          }).catch(() => {});
        }}
      >
        Publish saved draft
      </button>
    </Form>
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
      <h2>Global scoring weights</h2>

      <Form
        title="Global scoring weights"
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
            label={key + " weight"}
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
  return (
    <section className="admin-exact admin-settings-page">
      <header className="page-heading admin-exact-heading">
        <h1>
          <HeadingDot color="green" expression="squeezed" />
          Settings
        </h1>
      </header>
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
            title="Reveal AI scores"
            disabled={data.readiness?.scoring?.ready !== true}
            label="Reveal AI scores"
            onSave={async (f) => {
              await run("reveal-ai-scores", { reason: f.get("reason") });
            }}
          >
            <Field name="reason" label="Reveal reason" required minLength={5} />
          </Form>
          {data.me?.owner && (
            <Form
              title="Freeze final judging snapshot"
              disabled={data.readiness?.scoring?.ready !== true}
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
            title="Reveal Final score"
            disabled={data.readiness?.scoring?.ready !== true}
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
            <Field name="reason" label="Reveal reason" required minLength={5} />
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

      <AddAdmins owner={!!data.me?.owner} title="Admin access" run={run} />
      <AdminCreditInstructions
        providers={data.creditInstructions || []}
        run={run}
      />
      <details className="admin-settings-extra">
        <summary>
          Operational setup and readiness
          <ChevronDown size={20} aria-hidden="true" />
        </summary>
        {data.me?.owner && (
          <OwnerOperationalSetup
            key={`operational-${data.policyVersion}`}
            owner={true}
            version={data.policyVersion || 0}
            open={data.policy?.submissionOpen || ""}
            close={data.policy?.submissionClose || null}
            run={run}
          />
        )}
        <section className="panel">
          <h2>Operational and scoring readiness</h2>
          {!data.readiness?.initialized && (
            <p className="notice">Operational setup required.</p>
          )}
          {(
            [
              ["submissions", "Submissions"],
              ["checkin", "Check-in"],
            ] as const
          ).map(([scope, label]) => (
            <div key={scope}>
              <h3>{label}</h3>
              <p>{data.readiness?.[scope]?.message}</p>

              {data.me?.owner &&
                data.readiness?.[scope]?.configured &&
                !data.readiness[scope].enabled && (
                  <Form
                    label={`Enable ${label.toLowerCase()}`}
                    onSave={async (f) => {
                      await run("activate-operations", {
                        operation: scope,
                        version: data.policyVersion,
                        reason: f.get("reason"),
                      });
                    }}
                  >
                    <Field
                      name="reason"
                      label="Enablement reason"
                      required
                      minLength={5}
                    />
                  </Form>
                )}
            </div>
          ))}
          <h3>Judging and scoring</h3>
          <Pill tone={data.readiness?.scoring?.ready ? "positive" : "waiting"}>
            {data.readiness?.scoring?.ready
              ? "Policy ready · reveal remains explicit"
              : "Scoring setup incomplete"}
          </Pill>
          <ul>
            {(data.unresolved || []).map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <details>
            <summary>Scoring confirmations still required</summary>
            <ul>
              {(data.blockers || []).map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
        </section>
      </details>
      {data.me?.owner && (
        <details className="admin-settings-extra">
          <summary>
            Scoring configuration
            <ChevronDown size={20} aria-hidden="true" />
          </summary>
          <OwnerPolicyControls data={data} run={run} />
        </details>
      )}
      {data.me?.owner && (
        <details className="admin-settings-extra">
          <summary>
            Public event content
            <ChevronDown size={20} aria-hidden="true" />
          </summary>
          <ContentEditor
            key={`public-${data.content?.revision}`}
            data={data}
            run={run}
            scope="public"
          />
        </details>
      )}
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
}: {
  path: string;
  localTest?: boolean;
  initialPublic?: View;
}) {
  const path = canonical(original);
  const [data, setData] = useState<View>(initialPublic || {}),
    [loading, setLoading] = useState(!initialPublic && path !== "/"),
    [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [message, setMessage] = useState(""),
    [menu, setMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const gate = useRef<ConfirmationGate | null>(null),
    actionBusy = useRef(false),
    loadGeneration = useRef(0);
  if (!gate.current) gate.current = new ConfirmationGate(setConfirmation);
  async function load() {
    const generation = ++loadGeneration.current;
    setError("");
    try {
      const r = await fetch(
        `/api/portal?view=${encodeURIComponent(path)}&focus=${encodeURIComponent(new URLSearchParams(window.location.search).get("project") || "")}`,
        {
          cache: "no-store",
        },
      );
      const body = (await r.json()) as View;
      if (generation !== loadGeneration.current) return;
      if (!r.ok) {
        setErrorCode(body.code || "");
        setData({});
        throw new Error(
          body.message || body.code || "This page could not be loaded.",
        );
      }
      setErrorCode("");
      setData(body);
    } catch (e) {
      if (generation === loadGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible" && !actionBusy.current)
        void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [path]);
  useEffect(() => {
    const hide = () => {
      ++loadGeneration.current;
      gate.current?.decide(false);
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
    if (actionBusy.current) throw new ActionCancelled();
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
      setMessage(result.message || "Saved.");
      await load();
      return result;
    } catch (e) {
      setMessage(
        e instanceof ActionCancelled
          ? "Cancelled. No changes were made."
          : (e as Error).message,
      );
      throw e;
    } finally {
      actionBusy.current = false;
    }
  };
  const logout = async () => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    try {
      if (
        !(await gate.current!.ask(
          confirmationFor("logout", {}, data.me?.name || "This Site session"),
        ))
      ) {
        setMessage("Logout cancelled.");
        return;
      }
      if (localTest) await api("local-signout", {});
      setData({});
      setMessage("Signing out…");
      const link = document.createElement("a");
      link.href = localTest ? "/" : "/signout-with-chatgpt?return_to=%2F";
      link.target = "_top";
      link.click();
    } catch (e) {
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
            aria-controls="public-navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name={menu ? "close" : "menu"} />
            <span className="sr-only">{menu ? "Close menu" : "Open menu"}</span>
          </button>
          <nav
            id="public-navigation"
            aria-label="Public navigation"
            data-open={menu}
          >
            <a href="/" aria-current={path === "/" ? "page" : undefined}>
              {publicBrowse && <Icon name="home" />}
              Home
            </a>
            <a
              href="/projects"
              aria-current={publicBrowse ? "page" : undefined}
            >
              {publicBrowse && <Icon name="projects" />}Projects
            </a>
            <a
              className={publicBrowse ? "public-dashboard-link" : "button"}
              href={
                data.me
                  ? "/dashboard"
                  : "/signin-with-chatgpt?return_to=%2Fdashboard"
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
          aria-expanded={menu}
          aria-controls="site-navigation"
          onClick={() => setMenu(!menu)}
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
      <aside className={`sidebar ${menu ? "open" : ""}`}>
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
            <a
              key={href}
              href={href}
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
                                : label === "Settings"
                                  ? "settings"
                                  : label === "Logs"
                                    ? "logs"
                                    : "projects"
                }
              />
              {label}
            </a>
          ))}
          {!data.me && (
            <a href="/signin-with-chatgpt?return_to=%2Fdashboard" target="_top">
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
          <p className="action-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <div className="error-message" role="alert">
            {errorCode !== "LUMA_EMAIL_MISMATCH" && (
              <h2>This page could not load.</h2>
            )}
            <p>{error}</p>
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
                  href={`/signin-with-chatgpt?return_to=${encodeURIComponent(path)}`}
                >
                  Sign in with ChatGPT
                </a>
              )
            )}
          </div>
        )}
        {path === "/" ? (
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
          <CenteredLoader
            label={
              /^\/(dashboard|profile|teams|submission)(\/|$)/.test(path)
                ? "Checking registration…"
                : "Loading…"
            }
          />
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
  return (
    <details className={compact ? "admin-status-menu" : undefined}>
      <summary
        aria-label={`Change ${name} status`}
        title={`Change ${name} status`}
      >
        {compact ? <AdminIcon name="more" /> : <>Change {name} status</>}
      </summary>
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
    </details>
  );
}
