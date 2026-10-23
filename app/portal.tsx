"use client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
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
import DiscoveryProfile, { type DiscoveryPerson } from "./discovery-profile";
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
import AdminImportControls from "./admin-import-controls";
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
    values.typeId;
  const record = [
    ...(data.project ? [data.project] : []),
    ...(data.items || []),
    ...(data.roles || []),
    ...(data.members || []),
    ...(data.reviewers || []),
    ...(data.actions || []),
    ...(data.creditInstructions || []),
  ].find((r: Row) => r.id === id || r.user_id === id);
  if (values.kind === "person" && values.targetId)
    return portalTargetName(data, { userId: values.targetId });
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
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState(data.idea?.description || "");
  const t = data.team;
  const leader = !!t && data.me?.id === t.leader_id;
  const locked = !!(t?.locked || data.ideaLocked);
  if (!t)
    return (
      <section className="panel">
        <h3>Find your team</h3>

        <a className="button secondary" href="/discover/teams">
          Discover teams
        </a>
        {data.me?.canParticipate === true && <CreateTeam run={run} />}
      </section>
    );
  return (
    <section className="team-workspace">
      <div className="section-heading">
        <div className="identity-line">
          <TeamAvatar name={t.name} palette={t.palette} />
          <div>
            <h3>{t.name}</h3>
          </div>
        </div>
        <Pill>{data.teamStatus || "Forming"}</Pill>
      </div>
      {leader && !locked ? (
        <Form
          title="Team idea"
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
              <small id="idea-count">{description.length}/500 characters</small>
            </label>
          </fieldset>

          {locked && <Pill>Idea locked</Pill>}
        </Form>
      ) : (
        data.idea && (
          <section className="panel">
            <h3>{data.idea.title}</h3>
            <p className="prose">{data.idea.description}</p>
          </section>
        )
      )}
      <div className="form-actions">
        {leader && !locked && (
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
            Lock completed team
          </button>
        )}
      </div>
      {leader && !locked && (
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
      )}
      <Search value={search} onChange={setSearch} label="Search team members" />
      <ul className="member-list">
        {(data.members || [])
          .filter((m: Row) =>
            String(m.name || "")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((m: Row) => (
            <li key={m.id}>
              <DotAvatar
                color={m.avatarColor}
                expression={m.avatarExpression}
                size={48}
              />
              <div className="member-details">
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
                  {m.id === data.me?.id && " · You"}
                </strong>
                <small>{m.role === "leader" ? "Team leader" : "Member"}</small>
                {m.bio && <p>{m.bio}</p>}
                <SocialLinks socials={m.socials} />
                {m.phone && <small>{m.phone}</small>}
                {safeExternalUrl(m.whatsappUrl) && (
                  <a
                    className="text-link"
                    href={safeExternalUrl(m.whatsappUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open WhatsApp chat with ${m.name}`}
                  >
                    WhatsApp
                  </a>
                )}
              </div>
              <Pill>
                {m.status ||
                  (m.approval === "approved" ? "Going" : "Registered")}
              </Pill>
              {leader && !locked && m.role !== "leader" && (
                <button
                  className="link-button"
                  onClick={() => {
                    void run("remove-workspace-member", {
                      userId: m.id,
                      reason: "Team leader removed membership",
                    }).catch(() => {});
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
      </ul>
      {leader && !locked && (
        <>
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
        </>
      )}
      <details className="panel">
        <summary>Team and project rules</summary>
        <ul>
          <li>
            Teams have at most five registered people. Locking freezes
            membership, name and idea; it does not grant Going status.
          </li>
          <li>
            The leader must personally check in before saving or committing the
            project during the submission window.
          </li>
          <li>
            Exactly three successful project commits are available. Draft saves
            and navigation do not consume attempts.
          </li>
          <li>
            Repository creation and first commit must both be strictly after 1
            November, 08:00 IST.
          </li>
          <li>
            Credits and prize eligibility belong to individually checked-in
            recipients.
          </li>
        </ul>
        <a className="text-link" href="/rules">
          Read all rules
        </a>
      </details>
    </section>
  );
}
export function Dashboard({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
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
    <>
      <header className="page-heading">
        <h1>
          Dashboard
          <HeadingDot color="blue" expression="squeezed" />
        </h1>
      </header>
      <div className="status-strip">
        <div>
          <span>Registration</span>
          <Pill>{data.individualStatus || "Registered"}</Pill>
        </div>
        <div>
          <span>Team</span>
          <Pill>{data.teamStatus || "No team yet"}</Pill>
        </div>
      </div>
      <nav className="dashboard-sections" aria-label="Dashboard sections">
        <a href="#team">Team</a>
        <a href="#credits">Credits</a>
        <a href="#project">Project</a>
      </nav>
      <section
        id="team"
        className="dashboard-section"
        aria-labelledby="team-heading"
      >
        <h2 id="team-heading">Team</h2>
        <TeamWorkspace
          key={`${data.team?.id || "none"}-${data.idea?.description || ""}`}
          data={data}
          run={run}
        />
      </section>
      <section
        id="credits"
        className="dashboard-section"
        aria-labelledby="credits-heading"
      >
        <h2 id="credits-heading">Credits</h2>

        {(data.credits || []).map((c: Row) => (
          <Credit key={c.type_id} credit={c} />
        ))}
        {!data.credits?.length && <p>No credits assigned.</p>}
      </section>
      <section
        id="project"
        className="dashboard-section"
        aria-labelledby="project-heading"
      >
        <h2 id="project-heading">Project</h2>
        {data.submissionProgress?.status && (
          <p>{data.submissionProgress.status}</p>
        )}
        {data.projectStats && (
          <div className="project-summary">
            <span>
              {Number.isFinite(data.projectStats.upvotes)
                ? `${data.projectStats.upvotes} upvotes`
                : "Upvote count unavailable"}
            </span>
            {data.projectStats.result && (
              <PublicResult result={data.projectStats.result} />
            )}
          </div>
        )}
        {data.eligibility?.status === "ineligible" && (
          <p className="notice">
            Ineligible ·{" "}
            {data.eligibility.reason || "Check your private team feedback."}
          </p>
        )}
        {data.submissionAccess?.canRead === true ? (
          <Submission
            key={`${data.project?.revision || 0}-${data.team?.id || "none"}`}
            data={data}
            run={run}
          />
        ) : (
          <p className="notice">
            {data.submissionAccess?.message ||
              "Your project workspace is not available yet. The server checks attendance and team access."}
          </p>
        )}
        <section className="panel" aria-label="Private team feedback">
          <h3>Private team feedback</h3>

          {(data.feedback || []).map((f: Row) => (
            <article className="feedback-entry" key={f.id}>
              <p>{f.body}</p>
              <small>
                {f.author} · {f.kind} ·{" "}
                {new Date(f.created_at).toLocaleDateString()}
              </small>
            </article>
          ))}
          {!data.feedback?.length && <p>No feedback yet.</p>}
        </section>
      </section>
      {data.privateVenue ? (
        <section className="private-arrival">
          <h2>Your arrival details</h2>
          <p>{data.privateVenue.location}</p>
          <p className="prose">{data.privateVenue.directions}</p>
          {safeExternalUrl(data.privateVenue.mapUrl) && (
            <a
              className="text-link"
              href={safeExternalUrl(data.privateVenue.mapUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open private arrival map
            </a>
          )}
        </section>
      ) : null}
    </>
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
    <article className="credit-row">
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
          <Icon name="eye" />
          {busy ? "Revealing…" : value ? "Hide" : "Reveal"}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={!value || busy}
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
          <Icon name="copy" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function discoveryProfileProjection(row: Row): DiscoveryPerson {
  return {
    name: String(row.name || "Participant"),
    bio: String(row.bio || ""),
    socials: Array.isArray(row.socials)
      ? row.socials.filter((value: unknown) => typeof value === "string")
      : [],
    avatarColor: String(row.avatarColor || "blue"),
    avatarExpression: String(row.avatarExpression || "squeezed"),
  };
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
  const hashOpened = useRef("");
  const participants = path === "/discover/participants";
  useEffect(() => {
    if (participants && window.location.hash.startsWith("#person-")) {
      document
        .getElementById(window.location.hash.slice(1))
        ?.scrollIntoView({ block: "center", behavior: "auto" });
      const hash = window.location.hash;
      const row = (data.items || []).find(
        (person: Row) => `#person-${person.id}` === hash,
      );
      if (row && hashOpened.current !== hash) {
        hashOpened.current = hash;
        setSelectedPerson(discoveryProfileProjection(row));
      }
    }
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
    <>
      <header className="page-heading">
        <h1>
          Discover
          <HeadingDot color="purple" expression="round" />
        </h1>
      </header>
      <nav className="discovery-tabs" aria-label="Discover">
        <a
          href="/discover/teams"
          aria-current={!participants ? "page" : undefined}
        >
          Teams
        </a>
        <a
          href="/discover/participants"
          aria-current={participants ? "page" : undefined}
        >
          Participants
        </a>
      </nav>
      <div className="toolbar">
        <Search
          value={search}
          onChange={setSearch}
          label={
            participants ? "Search participants or teams" : "Search team names"
          }
        />
        {participants && (
          <label>
            <span className="sr-only">Team membership</span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All participants</option>
              <option value="in">In a team</option>
              <option value="out">Not in a team</option>
            </select>
          </label>
        )}
      </div>
      <ul className="directory-list">
        {items.map((row) => (
          <li key={row.id} id={participants ? `person-${row.id}` : undefined}>
            {participants ? (
              <DotAvatar
                color={row.avatarColor}
                expression={row.avatarExpression}
                size={56}
              />
            ) : (
              <TeamAvatar name={row.name} palette={row.palette} size={56} />
            )}
            <div>
              <h2>
                {participants ? (
                  <button
                    type="button"
                    className="link-button"
                    aria-haspopup="dialog"
                    onClick={() =>
                      setSelectedPerson(discoveryProfileProjection(row))
                    }
                  >
                    {row.name}
                  </button>
                ) : (
                  row.name
                )}
              </h2>
              {participants ? (
                <>
                  <Pill>{row.teamName ? "In a team" : "Not in a team"}</Pill>
                  {row.teamName && <p>{row.teamName}</p>}
                  <p>{row.bio}</p>
                  <SocialLinks socials={row.socials} />
                </>
              ) : (
                <>
                  <p>
                    {row.readiness?.total ?? "?"}{" "}
                    {row.readiness?.total === 1 ? "member" : "members"} ·{" "}
                    {row.status || (row.locked ? "Locked" : "Forming")}
                  </p>
                  <p>{row.bio}</p>
                </>
              )}
            </div>
            {!participants &&
              (data.team?.id === row.id ? (
                <Pill tone="positive">Your team</Pill>
              ) : (
                data.me?.canParticipate === true &&
                !data.team &&
                !row.locked && (
                  <button
                    className="button secondary"
                    disabled={!!row.requested}
                    onClick={() => {
                      void run("request-team", { teamId: row.id }).catch(
                        () => {},
                      );
                    }}
                  >
                    {row.requested ? "Requested" : "Request to join"}
                  </button>
                )
              ))}
          </li>
        ))}
      </ul>
      {selectedPerson && (
        <DiscoveryProfile
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}
      {!items.length && (
        <Empty>
          {search || teamFilter
            ? "No matches. Try another search or filter."
            : "No entries are available yet."}
        </Empty>
      )}
      {!participants && !data.team && data.me?.canParticipate === true && (
        <details className="panel">
          <summary>Create team</summary>
          <CreateTeam run={run} />
        </details>
      )}
    </>
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
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
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
        !project.description?.trim() ||
        !/^https:\/\/github\.com\//.test(project.github || ""))
    ) {
      setError("Add a project name, description and GitHub repository.");
      return;
    }
    if (step === 2 && (!project.logo || !project.banner)) {
      setError("Add your square logo and 16:9 banner.");
      return;
    }
    setStep(Math.min(3, step + 1));
  };
  const leader = data.team?.leader_id === data.me?.id;
  const attemptsUsed = Number.isInteger(data.submissionAccess?.attemptsUsed)
    ? data.submissionAccess.attemptsUsed
    : data.attempts?.length || 0;
  const canCommit =
    leader &&
    data.me?.canParticipate === true &&
    data.submissionAccess?.canCommit === true &&
    !data.submissionAccess?.locked &&
    attemptsUsed < 3;
  const saving = useRef(false);
  const set = (name: string, value: unknown) =>
    setProject((p: Row) => ({ ...p, [name]: value }));
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
  return (
    <>
      {data.submissionAccess?.canRead !== true ? (
        <p className="notice">
          This project is not available for your account.
        </p>
      ) : !data.team ? (
        <Empty>
          Create or join a team in <a href="/teams">Teams</a> first.
        </Empty>
      ) : (
        <>
          <div className="status-strip">
            <strong>{data.team.name}</strong>
            <Pill>{attemptsUsed}/3 versions committed</Pill>
            <Pill
              tone={data.teamReadiness?.allApproved ? "positive" : "waiting"}
            >
              {data.teamStatus || "Forming"}
            </Pill>
          </div>
          {data.eligibility?.status === "ineligible" && (
            <p className="notice">Ineligible · excluded from leaderboard</p>
          )}
          {data.leaderboardUrl && (
            <a className="button secondary" href={data.leaderboardUrl}>
              View project on leaderboard
            </a>
          )}
          {data.submissionStatus && !data.submissionStatus.allowed && (
            <p className="notice">{data.submissionStatus.message}</p>
          )}
          <form
            className="panel project-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <fieldset disabled={!canCommit || busy}>
              <legend>
                Step {step} of 3 · {Math.max(0, 3 - attemptsUsed)} submissions
                remaining
              </legend>
              <h2 ref={wizardHeading} tabIndex={-1}>
                {
                  ["Project essentials", "Project images", "Review and commit"][
                    step - 1
                  ]
                }
              </h2>
              <div hidden={step !== 1 && canCommit}>
                {[
                  ["projectName", "Project name"],
                  ["problemSolution", "One-line problem and solution"],
                  ["description", "Project description"],
                  ["github", "GitHub repository"],
                  ["demo", "Demo URL · optional"],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    {name === "description" ? (
                      <textarea
                        rows={4}
                        value={project[name]}
                        onChange={(e) => set(name, e.target.value)}
                      />
                    ) : (
                      <input
                        value={project[name]}
                        type={
                          name === "github" || name === "demo" ? "url" : "text"
                        }
                        onChange={(e) => set(name, e.target.value)}
                      />
                    )}
                  </label>
                ))}
                <fieldset className="submission-tools">
                  <legend>
                    How have you integrated OpenAI ecosystem in it?
                  </legend>
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
                </fieldset>
                <fieldset className="submission-tools">
                  <legend>
                    Does {project.projectName?.trim() || "your project"}{" "}
                    integrate Cerebras?
                  </legend>
                  {(["yes", "no"] as const).map((answer) => (
                    <label className="check-label" key={answer}>
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
                </fieldset>
              </div>
              <div hidden={step !== 2 && canCommit}>
                <div className="media-inputs">
                  {["logo", "banner"].map((kind) => (
                    <label key={kind}>
                      {kind === "logo"
                        ? "Project logo · required, 1:1"
                        : "Project banner · required, 16:9"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => {
                          void upload(e.target.files?.[0], kind);
                        }}
                      />
                      <small>PNG or JPEG · at most 128 KB</small>
                      {project[kind] && (
                        <img
                          className={`upload-preview ${kind}`}
                          src={project[kind]}
                          alt={`${kind} preview`}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
              <div hidden={step !== 3 && canCommit}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!!project.attestation}
                    onChange={(e) => set("attestation", e.target.checked)}
                  />
                  We confirm this submission accurately describes our team’s
                  work.
                </label>
              </div>
              <div className="form-actions">
                {step > 1 && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setStep(step - 1)}
                  >
                    Back
                  </button>
                )}
                {step < 3 && (
                  <button type="button" className="button" onClick={next}>
                    Next <ArrowRight size={20} aria-hidden="true" />
                  </button>
                )}
                <button className="button" disabled={busy}>
                  Save draft
                </button>
                <button
                  type="button"
                  hidden={step !== 3}
                  className="button secondary"
                  disabled={busy || !canCommit}
                  onClick={() => {
                    void save(true);
                  }}
                >
                  Commit submission
                </button>
              </div>
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
          <ProjectHistory canRead={data.submissionAccess?.canRead === true} />
        </>
      )}
    </>
  );
}
export function ProjectHistory({ canRead }: { canRead: boolean }) {
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
        View committed history
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
              <p>{new Date(item.created_at).toLocaleString()}</p>
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
function ProjectBody({ project }: { project: Row }) {
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
          <p>Team {project.teamName || "project team"}</p>
        </div>
      </div>
      <p className="project-description">{project.problemSolution}</p>
      <p className="prose">{project.description}</p>
      <div className="form-actions">
        {project.demo && (
          <a
            className="button"
            href={project.demo}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open demo
          </a>
        )}
        {project.github && (
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
    [searchError, setSearchError] = useState("");
  const board = path === "/leaderboard",
    detail = path !== "/projects" && !board,
    p = data.items?.[0];
  const highlighted = useRef(false);
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
      <a href={`/projects/${p.slug}#comments`}>
        {p.comments} comment{p.comments === 1 ? "" : "s"}
      </a>
    </div>
  );
  if (detail && p)
    return (
      <>
        <a className="back-link" href="/projects">
          <ArrowLeft size={20} aria-hidden="true" /> Projects
        </a>
        <article className="project-detail">
          <ProjectBody project={p} />
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
                <strong>{c.author}</strong>
                <p>{c.body}</p>
                <small>{new Date(c.created_at).toLocaleString()}</small>
              </article>
            ))}
            {data.me?.canEngage === true &&
            p.canComment === true &&
            !data.engagement?.feedbackPaused ? (
              <Form
                title="Join the conversation"
                label="Post comment"
                onSave={async (f) => {
                  await run("comment-project", {
                    projectId: p.id,
                    body: f.get("body"),
                  });
                }}
              >
                <Field
                  name="body"
                  label="Public comment"
                  type="textarea"
                  required
                />
              </Form>
            ) : data.me ? null : (
              <a className="button" href={signIn} target="_top">
                Sign in to comment
              </a>
            )}
          </section>
        </article>
      </>
    );
  return (
    <>
      <header className="page-heading">
        <h1>
          {board ? "Leaderboard" : "Projects"}
          <HeadingDot color="purple" expression="round" />
        </h1>
      </header>
      <Search
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(0);
        }}
        label="Search projects or teams"
      />
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
                  className="row-banner"
                  src={p.banner}
                  alt=""
                />
                <img
                  loading="lazy"
                  decoding="async"
                  className="row-logo"
                  src={p.logo}
                  alt=""
                />
                <div>
                  <h2>{p.projectName}</h2>
                  <p>Team {p.teamName}</p>
                  <small>{p.problemSolution}</small>
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
      <div className="form-actions">
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
    </>
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
    [filtersExpanded, setFiltersExpanded] = useState(false);
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
    <>
      <header className="page-heading">
        <h1>
          Participants
          <HeadingDot color="orange" expression="plus" />
        </h1>
      </header>
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
        <details className="panel admin-import-panel">
          <summary>
            <AdminIcon name="person" />
            Add participants
          </summary>
          <AdminImportControls run={run} />
        </details>
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
              <th>Participant</th>
              <th>Team</th>
              <th>Approval</th>
              <th>Team status</th>
              <th>Attendance</th>
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
                  {r.teamName || "Not in a team"}
                  <small>
                    {r.teamReadiness?.total
                      ? `${r.teamReadiness?.approved}/${r.teamReadiness?.total} approved`
                      : ""}
                  </small>
                </td>
                <td>
                  <Pill
                    tone={r.approval === "approved" ? "positive" : "neutral"}
                  >
                    {r.approval === "approved"
                      ? "Going"
                      : r.approval === "pending"
                        ? "Registered"
                        : r.approval}
                  </Pill>
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
                <td>{r.checked_in ? "Checked in" : "Not checked in"}</td>
                {canManage && (
                  <td>
                    {r.id ? (
                      <div className="admin-row-actions">
                        {!r.removed && (
                          <StatusChange
                            kind="person"
                            target={r.id}
                            name={r.name || r.email}
                            current={r.status}
                            run={run}
                            compact
                          />
                        )}
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
    </>
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
  const p = data.project,
    v = data.version;
  if (!p) return <Empty>Select a submitted project.</Empty>;
  const payload = v?.payload || p.draft;
  return (
    <>
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
      <div className="review-layout">
        <article>
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
        <aside>
          <Form
            title={
              data.reviewKind === "mentor" ? "Private advice" : "Private review"
            }
            label="Save review"
            onSave={async (f) => {
              await run(
                "review-project",
                privateReviewValues(f, data.reviewKind, p.id, v?.id),
              );
            }}
            disabled={!v}
          >
            {["admin", "judge"].includes(data.reviewKind) && (
              <label>
                Score · 1 to 10, reviewer-private · optional
                <input
                  name="rating"
                  type="number"
                  min={1}
                  max={10}
                  step="any"
                />
              </label>
            )}
            <Field
              name="body"
              label={
                ["admin", "judge"].includes(data.reviewKind)
                  ? "Feedback for the team · optional when scoring"
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
            <section className="panel">
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
                  {r.state} · {new Date(r.created_at).toLocaleString()}
                  {r.error && <small>{r.error}</small>}
                </p>
              ))}
            </section>
          )}
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
                <small>{new Date(h.created_at).toLocaleString()}</small>
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
    </>
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
  return (
    <>
      <header className="page-heading">
        <h1>
          {logs
            ? "Logs"
            : teams
              ? "Teams"
              : credits
                ? "Credits"
                : "Submissions"}
          <HeadingDot color="green" expression="cheerful" />
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
              ? "Search team or member"
              : credits
                ? "Search credits"
                : "Search records"
          }
        />
        {!logs && !credits && (
          <button
            className="admin-toolbar-icon admin-mobile-filter"
            aria-label={teams ? "Team filters" : "Submission filters"}
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
            ).map((s) => (
              <option key={s}>{s}</option>
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
        {teams && (
          <a
            className="button secondary"
            aria-label="Export member emails"
            href={`/api/export?list=team-emails&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&lock=${encodeURIComponent(lockFilter)}`}
          >
            <AdminIcon name="users" />
            <span className="admin-export-label">Member emails</span>
          </a>
        )}
        {path !== "/review" && (
          <a
            className="button secondary"
            aria-label="Export CSV"
            href={`/api/export?list=${logs ? "logs" : teams ? "teams" : credits ? "credits" : "submissions"}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&lock=${encodeURIComponent(lockFilter)}`}
          >
            <AdminIcon name="download" />
            <span className="admin-export-label">Export CSV</span>
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
          {items.map((t) => (
            <li key={t.id}>
              <header className="section-heading">
                <div className="identity-line">
                  <TeamAvatar name={t.name} palette={t.palette} />
                  <h2>{t.name}</h2>
                  <Pill>{t.status}</Pill>
                </div>
                <div className="admin-team-actions">
                  <Pill tone={t.readiness.allApproved ? "positive" : "waiting"}>
                    {t.status}
                  </Pill>
                  <StatusChange
                    kind="team"
                    target={t.id}
                    name={t.name}
                    current={t.status}
                    run={run}
                    compact
                  />
                </div>
              </header>
              <ul className="member-list">
                {t.members.map((m: Row) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                    </div>
                    <Pill>
                      {m.approval === "approved" ? "Going" : "Registered"}
                    </Pill>
                    {m.id !== t.leader_id && (
                      <button
                        className="admin-toolbar-icon admin-icon-danger"
                        aria-label={`Remove ${m.name || m.email} from ${t.name}`}
                        title={`Remove ${m.name || m.email}`}
                        onClick={() => {
                          void run("remove-workspace-member", {
                            userId: m.id,
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
            </li>
          ))}
        </ul>
      ) : logs ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["Time", "Action", "Reason", "Change summary"].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.action}</td>
                  <td>{r.reason}</td>
                  <td className="log-detail">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="submission-list">
          {items.map((r) => (
            <li key={r.id}>
              <a
                href={`${path === "/review" ? "/review" : "/admin/submissions"}/${r.slug}`}
              >
                <div>
                  <h2>{r.projectName || "Untitled draft"}</h2>
                  <p>Team {r.teamName}</p>
                </div>
                <Pill>{r.status}</Pill>
                <span>
                  Review project <ArrowRight size={20} aria-hidden="true" />
                </span>
              </a>
              {path === "/admin/submissions" &&
                (data.me?.owner || data.me?.role === "admin") && (
                  <details className="panel">
                    <summary>
                      {r.deleted_at
                        ? "Removed project · manage restoration"
                        : "Manage project and submissions"}
                    </summary>
                    <AdminProjectActions
                      key={`${r.id}-${r.deleted_at || "active"}-${JSON.stringify(r.versions || [])}`}
                      {...adminProjectProjection(r)}
                      run={run}
                    />
                  </details>
                )}
            </li>
          ))}
        </ul>
      )}
      {!items.length && <Empty>No records match this view.</Empty>}
    </>
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
      <section className="panel">
        <h2>Community engagement</h2>
      </section>
    );
  return (
    <Form
      title="Community engagement"
      label="Review engagement settings"
      onSave={async (form) => {
        await run("engagement-control", {
          votingPaused: form.get("votingPaused") === "on",
          feedbackPaused: form.get("feedbackPaused") === "on",
          version: settings.version,
          reason: form.get("reason"),
          confirmation: "CHANGE_ENGAGEMENT",
        });
      }}
    >
      <Field
        name="votingPaused"
        type="checkbox"
        label="Pause community voting"
        value={settings.votingPaused}
      />
      <Field
        name="feedbackPaused"
        type="checkbox"
        label="Pause public feedback"
        value={settings.feedbackPaused}
      />
      <Field name="reason" label="Audit reason" required minLength={5} />
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
    <>
      <header className="page-heading">
        <h1>
          Settings
          <HeadingDot color="green" expression="cheerful" />
        </h1>
      </header>
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
      <AdminEngagementControls
        key={`engagement-${data.engagement?.version ?? "pending"}`}
        data={data}
        run={run}
      />
      <details className="panel">
        <summary>Shared credit setup instructions</summary>

        {(data.creditInstructions || []).map((c: Row) => (
          <Form
            key={c.id + String(c.instructions)}
            title={c.name}
            label="Update instructions"
            onSave={async (f) => {
              await run("update-credit-instructions", {
                typeId: c.id,
                markdown: f.get("markdown"),
                reason: f.get("reason"),
              });
            }}
          >
            <Field
              name="markdown"
              label="Markdown instructions"
              type="textarea"
              value={c.instructions}
            />
            <Field name="reason" label="Reason" required minLength={5} />
            <details>
              <summary>Current rendered steps</summary>
              <CreditInstructions markdown={c.instructions || ""} />
            </details>
          </Form>
        ))}
      </details>
      {data.me?.owner && (
        <>
          <OwnerSubmissionWindow
            key={`${data.policyVersion}-${data.policy?.submissionOpen}-${data.policy?.submissionClose}`}
            owner={true}
            open={data.policy?.submissionOpen || ""}
            close={data.policy?.submissionClose || ""}
            run={run}
          />
          <OwnerPolicyControls data={data} run={run} />
        </>
      )}
      {(data.me?.owner || data.me?.role === "admin") && (
        <section className="panel">
          <h2>Score reveals</h2>
          <p>Current stage: {data.scoreRelease?.stage || "community"}</p>

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
      <AddAdmins owner={!!data.me?.owner} run={run} />
      {data.me?.owner && (
        <ContentEditor
          key={`public-${data.content?.revision}`}
          data={data}
          run={run}
          scope="public"
        />
      )}
    </>
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
  const c =
    teamPalettes[(data.team?.palette || "forest") as Palette] ||
    teamPalettes.forest;
  return (
    <div
      className={`app-shell ${path === "/" ? "public-home-shell" : ""}`}
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
      {path === "/" && (
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
            <a href="/" aria-current="page">
              Home
            </a>
            <a href="/projects">Projects</a>
            <a
              className="button"
              href={
                data.me
                  ? "/dashboard"
                  : "/signin-with-chatgpt?return_to=%2Fdashboard"
              }
              target="_top"
            >
              {data.me ? "Dashboard" : "Sign in"}
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
                className="link-button"
                type="button"
                onClick={() => void logout()}
              >
                Log out
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
                <section>
                  <h1>Rules</h1>
                  {(data.categories || []).map((c: Row) => (
                    <section key={c.title} className="panel">
                      <h2>{c.title}</h2>
                      <ul>
                        {c.items.map((t: string) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </section>
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
}: {
  kind: "person" | "team";
  target: string;
  name: string;
  current: string;
  run: (a: string, d: Row) => Promise<Row>;
  compact?: boolean;
}) {
  return (
    <details className={compact ? "admin-status-menu" : undefined}>
      <summary
        aria-label={`Change ${name} status`}
        title={`Change ${name} status`}
      >
        {compact ? <AdminIcon name="more" /> : <>Change {name} status</>}
      </summary>
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
    </details>
  );
}
