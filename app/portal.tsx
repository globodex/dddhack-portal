"use client";
import {
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import Home from "./home";
import ProfileFlow from "./profile-flow";
import CreditInstructions from "./credit-instructions";
import ConfirmationDialog from "./confirmation-dialog";
import {
  ActionCancelled,
  ConfirmationGate,
  confirmationFor,
  revealConfirmation,
  type Confirmation,
} from "../lib/action-confirmation";
import TeamAvatar from "./team-avatar";
import {
  avatarPresets,
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
  avatar,
  setAvatar,
  palette,
  setPalette,
}: {
  avatar: string;
  setAvatar: (v: string) => void;
  palette: string;
  setPalette: (v: string) => void;
}) {
  return (
    <>
      <div className="badge-preview">
        <TeamAvatar avatar={avatar} palette={palette} size={88} />
        <div>
          <strong>Your team identity</strong>
          <p className="muted">
            One original geometric badge. A shared accent for every member.
          </p>
        </div>
      </div>
      <fieldset>
        <legend>Choose a shape</legend>
        <div className="avatar-picker">
          {avatarPresets.map((a) => (
            <label key={a} title={a}>
              <input
                type="radio"
                name="avatar"
                value={a}
                checked={avatar === a}
                onChange={() => setAvatar(a)}
              />
              <TeamAvatar avatar={a} palette={palette} size={48} />
              <span>{a}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Choose a palette</legend>
        <div className="palette-picker">
          {Object.entries(teamPalettes).map(([key, c]) => (
            <label key={key}>
              <input
                type="radio"
                name="palette"
                value={key}
                checked={palette === key}
                onChange={() => setPalette(key)}
              />
              <span className="palette-swatch" style={{ background: c.ink }} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
function CreateTeam({ run }: { run: (a: string, d: Row) => Promise<Row> }) {
  const [avatar, setAvatar] = useState("orbit"),
    [palette, setPalette] = useState("forest");
  return (
    <Form
      title="Start your team"
      label="Create team"
      onSave={async (f) => {
        await run("create-workspace-team", {
          name: f.get("name"),
          bio: f.get("bio"),
          avatar,
          palette,
        });
      }}
    >
      <Field name="name" label="Team name" required />
      <Field
        name="bio"
        label="What would you like to build? · optional"
        type="textarea"
      />
      <AvatarChooser {...{ avatar, setAvatar, palette, setPalette }} />
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
  const [avatar, setAvatar] = useState(team.avatar || "orbit"),
    [palette, setPalette] = useState(team.palette || "forest");
  return (
    <details className="panel">
      <summary>Customize your team badge and accent</summary>
      <Form
        className="inset-form"
        onSave={async () => {
          await run("team-style", { avatar, palette });
        }}
        label="Update team identity"
      >
        <AvatarChooser {...{ avatar, setAvatar, palette, setPalette }} />
      </Form>
    </details>
  );
}
function TeamWorkspace({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [search, setSearch] = useState("");
  const t = data.team;
  if (!t)
    return (
      <>
        <Empty>
          Create a team below, or <a href="/teams">find a team</a> and request
          to join.
        </Empty>
        {data.me?.role === "participant" && <CreateTeam run={run} />}
      </>
    );
  return (
    <section className="team-workspace">
      <div className="section-heading">
        <div className="identity-line">
          <TeamAvatar avatar={t.avatar} palette={t.palette} />
          <div>
            <span className="eyebrow">Your team</span>
            <h2>{t.name}</h2>
          </div>
        </div>
        <Pill tone={data.teamReadiness?.allApproved ? "positive" : "waiting"}>
          {data.teamStatus || "Forming"}
        </Pill>
      </div>
      {data.me?.id === t.leader_id ? (
        <Form
          title="Team idea"
          disabled={data.ideaLocked}
          label="Update team idea"
          onSave={async (f) => {
            await run("save-workspace-idea", {
              title: f.get("title"),
              core: f.get("core"),
              description: f.get("description"),
            });
          }}
        >
          <p className="muted">
            Idea and roster lock together on October 29 at 23:59 IST.
          </p>
          <fieldset disabled={data.ideaLocked}>
            <Field
              name="title"
              label="Idea title"
              value={data.idea?.title}
              required
            />
            <Field
              name="core"
              label="Core concept"
              type="textarea"
              value={data.idea?.core}
              required
              minLength={10}
            />
            <Field
              name="description"
              label="Idea details"
              type="textarea"
              value={data.idea?.description}
            />
          </fieldset>
          {data.ideaLocked && <Pill>Idea locked</Pill>}
        </Form>
      ) : (
        data.idea && (
          <section className="panel">
            <h3>{data.idea.title}</h3>
            <p>{data.idea.core}</p>
            <p>{data.idea.description}</p>
          </section>
        )
      )}
      <div className="form-actions">
        <Pill>{t.locked ? "Team locked" : "Team unlocked"}</Pill>
        {data.me?.id === t.leader_id && !t.locked && (
          <button
            className="button secondary"
            onClick={() => {
              void run("lock-team", {}).catch(() => {});
            }}
          >
            Lock completed team
          </button>
        )}
      </div>
      <details className="panel">
        <summary>Team and submission rules</summary>
        <ul>
          <li>Every member must register. Teams have at most five people.</li>
          <li>
            Only individuals Going on the portal can be accommodated. Locking a
            team is not approval or Going; Luma is registration only.
          </li>
          <li>Locking freezes membership and team details for admin review.</li>
          <li>
            At least one member must individually check in before team
            submissions unlock, within the event window.
          </li>
          <li>
            Exactly three committed submissions: the initial entry counts as
            one, each committed update counts again. After three, no project
            edits. Draft typing and navigation do not use attempts.
          </li>
          <li>
            Credits belong only to their individually checked-in recipient.
          </li>
          <li>
            Repository creation and first commit must BOTH be strictly after 1
            November, 08:00 IST. Submit the full commit SHA; dates are
            operational evidence, not proof of original authorship.
          </li>
          <li>
            Only individually checked-in members qualify for prizes or rewards.
            Absent members do not disqualify the team.
          </li>
          <li>No parking is available.</li>
        </ul>
      </details>
      <Search value={search} onChange={setSearch} label="Search team members" />
      <ul className="member-list">
        {(data.members || [])
          .filter((m: Row) =>
            m.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((m: Row) => (
            <li key={m.id}>
              <span className="person-monogram" aria-hidden="true">
                {String(m.name).slice(0, 2).toUpperCase()}
              </span>
              <div>
                <strong>{m.id === data.me?.id ? "You" : m.name}</strong>
                <small>{m.role === "leader" ? "Team leader" : "Member"}</small>
              </div>
              <Pill tone={m.approval === "approved" ? "positive" : "neutral"}>
                {m.approval === "approved" ? "Going" : "Registered"}
              </Pill>
              {t.leader_id === data.me?.id && m.role !== "leader" && (
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
      {t.leader_id === data.me?.id && (
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
            {!(data.actions || []).some(
              (r: Row) =>
                r.kind === "request" &&
                r.status === "pending" &&
                r.team_id === t.id,
            ) && <p className="muted">No pending requests.</p>}
          </details>
          <TeamStyle team={t} run={run} />
        </>
      )}
    </section>
  );
}
function Dashboard({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Your build day, together</p>
        <h1>
          Dashboard
          <span className="heading-dot blue" />
        </h1>
      </header>
      <div className="status-strip">
        <div>
          <span>Registration</span>
          <Pill
            tone={
              data.registration?.status === "approved" ? "positive" : "neutral"
            }
          >
            {data.individualStatus || "Registered"}
          </Pill>
        </div>
        <div>
          <span>Team</span>
          <Pill tone={data.teamReadiness?.allApproved ? "positive" : "waiting"}>
            {data.teamStatus || "No team yet"}
          </Pill>
        </div>
        <div>
          <span>Attendance / progress</span>
          <Pill>{data.status || "Registered"}</Pill>
        </div>
      </div>
      <p>
        <strong>{data.submissionProgress?.status || "Not submitted"}</strong> ·{" "}
        {data.submissionProgress?.attemptsUsed || 0}/3 committed
      </p>
      {data.eligibility?.status === "ineligible" && (
        <p className="notice">
          <Pill tone="waiting">Ineligible</Pill> Your submission is excluded
          from the leaderboard.{" "}
          {data.eligibility.reason || "Check your private team feedback."}
        </p>
      )}

      {data.leaderboardUrl && (
        <a className="button secondary" href={data.leaderboardUrl}>
          View project on leaderboard
        </a>
      )}
      <TeamWorkspace data={data} run={run} />
      <div className="workspace-links">
        {data.submissionAccess?.canAccess ? (
          <a href="/submission">
            <strong>Submission</strong>
            <span>
              {data.attempts?.length
                ? `${data.attempts.length} committed version${data.attempts.length === 1 ? "" : "s"}`
                : "Not submitted"}
            </span>
            <span>Open submission →</span>
          </a>
        ) : (
          <span>{data.submissionAccess?.message}</span>
        )}
        <details>
          <summary>
            Credits <span className="muted">Private to you</span>
          </summary>
          {(data.credits || []).map((c: Row) => (
            <Credit key={c.type_id} credit={c} />
          ))}
          {!data.credits?.length && (
            <p className="muted">No personal credits are available yet.</p>
          )}
        </details>
        <details>
          <summary>
            Team feedback <span className="muted">Private to this team</span>
          </summary>
          {(data.feedback || []).map((f: Row) => (
            <article className="feedback-entry" key={f.id}>
              <p>{f.body}</p>
              <small>
                {f.author} · {f.kind} ·{" "}
                {new Date(f.created_at).toLocaleDateString()}
              </small>
            </article>
          ))}
          {!data.feedback?.length && (
            <p className="muted">
              Feedback will appear here after a reviewer shares it.
            </p>
          )}
        </details>
        {data.privateVenue ? (
          <section className="private-arrival">
            <h2>Your arrival details</h2>
            <p>{data.privateVenue.location}</p>
            <p className="prose">{data.privateVenue.directions}</p>
            {data.privateVenue.mapUrl && (
              <a
                className="text-link"
                target="_blank"
                rel="noopener noreferrer"
                href={data.privateVenue.mapUrl}
              >
                Open private arrival map
              </a>
            )}
          </section>
        ) : (
          <p className="muted">
            Exact arrival details are available only when every current team
            member is approved and the hosts publish them.
          </p>
        )}
      </div>
    </>
  );
}
function Credit({ credit }: { credit: Row }) {
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="credit-row">
      <strong>{credit.name}</strong>
      <CreditInstructions markdown={credit.instructions || ""} />
      {value ? (
        <>
          <code>{value}</code>
          <button className="link-button" onClick={() => setValue("")}>
            Hide code
          </button>
        </>
      ) : (
        <button
          className="button secondary"
          disabled={!credit.allocated}
          onClick={async () => {
            try {
              setValue(
                String(
                  (await api("reveal-credit", { typeId: credit.type_id }))
                    .value,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Reveal my allocation
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function Teams({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [search, setSearch] = useState("");
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Signed-in directory · private</p>
        <h1>
          Teams
          <span className="heading-dot violet" />
        </h1>
        <p className="muted">
          Find your people. Membership requests go to the team leader.
        </p>
      </header>
      <Search value={search} onChange={setSearch} label="Search team names" />
      <ul className="directory-list">
        {(data.items || [])
          .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
          .map((t) => (
            <li key={t.id}>
              <TeamAvatar avatar={t.avatar} palette={t.palette} />
              <div>
                <h2>{t.name}</h2>
                <p>
                  {t.readiness.total} member{t.readiness.total === 1 ? "" : "s"}{" "}
                  · {t.readiness.approved} approved
                </p>
                <small>{t.bio}</small>
              </div>
              {data.team?.id === t.id ? (
                <Pill tone="positive">Your team</Pill>
              ) : (
                <button
                  className="button secondary"
                  disabled={
                    !!data.team ||
                    t.requested ||
                    data.me?.role !== "participant"
                  }
                  onClick={() => {
                    void run("request-team", { teamId: t.id }).catch(() => {});
                  }}
                >
                  {t.requested
                    ? "Requested"
                    : data.team
                      ? "Already in a team"
                      : "Request to join"}
                </button>
              )}
            </li>
          ))}
      </ul>
      {!data.items?.length && <Empty>Be the first team to get started.</Empty>}
      {!data.team && data.me?.role === "participant" && (
        <CreateTeam run={run} />
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
  attestation: false,
  contributions: [] as Row[],
};
function Submission({
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
    setBusy(true);
    setError("");
    try {
      await run(submit ? "submit-project" : "save-project", {
        revision: data.project?.revision || 0,
        project: {
          ...project,
          contributions: (data.members || []).map((m: Row) => ({
            userId: m.id,
            role:
              project.contributions.find((c: Row) => c.userId === m.id)?.role ||
              "",
            codex:
              project.contributions.find((c: Row) => c.userId === m.id)
                ?.codex || "",
          })),
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const contribution = (userId: string, field: string, value: string) =>
    setProject((p: Row) => ({
      ...p,
      contributions: [
        ...p.contributions.filter((c: Row) => c.userId !== userId),
        {
          userId,
          role:
            p.contributions.find((c: Row) => c.userId === userId)?.role || "",
          codex:
            p.contributions.find((c: Row) => c.userId === userId)?.codex || "",
          [field]: value,
        },
      ],
    }));
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Your shared project record</p>
        <h1>
          Submission
          <span className="heading-dot green" />
        </h1>
        <p className="muted">
          Only the team leader can save or commit during the submission window.
          Eligible committed projects appear automatically on the leaderboard.
        </p>
      </header>
      {!data.team ? (
        <Empty>
          Create or join a team in <a href="/teams">Teams</a> first.
        </Empty>
      ) : (
        <>
          <div className="status-strip">
            <strong>{data.team.name}</strong>
            <Pill>{data.attempts?.length || 0}/3 versions committed</Pill>
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
            <fieldset
              disabled={!leader || busy || data.submissionAccess?.locked}
            >
              <legend>
                Step {step} of 3 · {3 - (data.attempts?.length || 0)}{" "}
                submissions remaining
              </legend>
              <h2 ref={wizardHeading} tabIndex={-1}>
                {
                  ["Project essentials", "Project images", "Review and commit"][
                    step - 1
                  ]
                }
              </h2>
              <div hidden={step !== 1 && !data.submissionAccess?.locked}>
                {[
                  ["projectName", "Project name"],
                  ["problemSolution", "One-line problem and solution"],
                  ["description", "Project description"],
                  ["github", "GitHub repository"],
                  ["demo", "Demo URL · optional"],
                  ["tools", "Tools and how you used them"],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    {name === "description" || name === "tools" ? (
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
              </div>
              <div hidden={step !== 2 && !data.submissionAccess?.locked}>
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
              <div hidden={step !== 3 && !data.submissionAccess?.locked}>
                <h3>Everyone’s contribution</h3>
                {(data.members || []).map((m: Row) => (
                  <div className="contribution" key={m.id}>
                    <h3>{m.name}</h3>
                    <label>
                      Contribution
                      <input
                        value={
                          project.contributions.find(
                            (c: Row) => c.userId === m.id,
                          )?.role || ""
                        }
                        onChange={(e) =>
                          contribution(m.id, "role", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Use of Codex or other tools
                      <input
                        value={
                          project.contributions.find(
                            (c: Row) => c.userId === m.id,
                          )?.codex || ""
                        }
                        onChange={(e) =>
                          contribution(m.id, "codex", e.target.value)
                        }
                      />
                    </label>
                  </div>
                ))}
                <label>
                  Submitted commit SHA
                  <input
                    value={project.commitSha || ""}
                    pattern="[a-fA-F0-9]{40}"
                    maxLength={40}
                    onChange={(e) => set("commitSha", e.target.value)}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!!project.attestation}
                    onChange={(e) => set("attestation", e.target.checked)}
                  />
                  We confirm this submission accurately describes our team’s
                  work.
                </label>
                <p className="muted">
                  Committing uses one of the team’s three submissions.{" "}
                  {Math.max(0, 2 - (data.attempts?.length || 0))} will remain
                  after this commit.
                </p>
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
                    Next →
                  </button>
                )}
                <button className="button" disabled={busy}>
                  Save draft
                </button>
                <button
                  type="button"
                  hidden={step !== 3}
                  className="button secondary"
                  disabled={
                    busy ||
                    !data.submissionAccess?.canAccess ||
                    data.submissionAccess?.locked ||
                    (data.attempts?.length || 0) >= 3
                  }
                  onClick={() => {
                    void save(true);
                  }}
                >
                  Commit submission
                </button>
              </div>
            </fieldset>
            {!leader && (
              <p className="notice">
                Only your team leader can edit or commit. This is your team’s
                saved draft.
              </p>
            )}
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
          </form>
          <details className="panel">
            <summary>Committed version history</summary>
            {(data.attempts || []).map((v: Row) => (
              <p key={v.id}>
                Version {v.attempt} · {new Date(v.created_at).toLocaleString()}
              </p>
            ))}
          </details>
        </>
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
function Projects({
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
      <div>
        {data.me ? (
          <button
            className="round-button"
            aria-label={`Upvote ${p.projectName}`}
            onClick={() => {
              void run("upvote-project", { projectId: p.id }).catch(() => {});
            }}
          >
            ↑
          </button>
        ) : (
          <a
            className="round-button"
            href={signIn}
            target="_top"
            aria-label={`Sign in to upvote ${p.projectName}`}
          >
            ↑
          </a>
        )}
        <span>
          {p.upvotes} upvote{p.upvotes === 1 ? "" : "s"}
        </span>
      </div>
      <a href={`/projects/${p.slug}#comments`}>
        {p.comments} comment{p.comments === 1 ? "" : "s"}
      </a>
    </div>
  );
  if (detail && p)
    return (
      <>
        <a className="back-link" href="/projects">
          ← Projects
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
          <section id="comments">
            <h2>Comments</h2>
            {(data.comments || []).map((c: Row) => (
              <article className="public-comment" key={c.id}>
                <strong>{c.author}</strong>
                <p>{c.body}</p>
                <small>{new Date(c.created_at).toLocaleString()}</small>
              </article>
            ))}
            {data.me ? (
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
            ) : (
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
        <p className="eyebrow">Built by the community</p>
        <h1>
          {board ? "Leaderboard" : "Projects"}
          <span className="heading-dot violet" />
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
      {!data.me && (
        <p className="muted">
          Sign in to upvote or comment. Scores remain private until the owner
          reveals results.
        </p>
      )}
    </>
  );
}
function AdminParticipants({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [teamFilter, setTeamFilter] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [status, setStatus] = useState("pending"),
    [reason, setReason] = useState(""),
    [emails, setEmails] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [error, setError] = useState("");
  const items = (data.items || []).filter(
    (r) =>
      `${r.name || ""} ${r.email} ${r.team_name || ""}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!filter || r.status === filter) &&
      (!teamFilter || r.teamStatus === teamFilter),
  );
  const csv =
    "email\n" +
    [...new Set(emails.split(/[\s,;]+/).filter(Boolean))].join("\n");
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">
          {data.lookupOnly
            ? "Attendance operations"
            : "Participant administration"}
        </p>
        <h1>
          Participants
          <span className="heading-dot orange" />
        </h1>
      </header>
      <div className="toolbar">
        <Search value={q} onChange={setQ} label="Search name, email or team" />
        <label>
          <span className="sr-only">Status filter</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Status: all</option>
            {["Registered", "Going", "Checked in", "Absent"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <select
          aria-label="Team progress filter"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          <option value="">Team: all</option>
          {["Forming", "Locked", "Not submitted", "Submitted"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        {!data.lookupOnly && (
          <a
            className="button secondary"
            href={`/api/export?list=participants&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&teamStatus=${encodeURIComponent(teamFilter)}`}
          >
            Export CSV
          </a>
        )}
      </div>
      {!data.lookupOnly && (
        <details className="panel">
          <summary>Add emails or import a roster</summary>
          <label>
            Emails · one per line or separated by commas
            <textarea
              rows={4}
              value={emails}
              onChange={(e) => {
                setEmails(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Or load an email CSV
            <input
              type="file"
              accept="text/csv,.csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 512000) {
                  setError("CSV must be at most 512 KB.");
                  return;
                }
                const text = await file.text();
                setEmails(text.replace(/^email\s*\r?\n/i, ""));
                setPreview(null);
              }}
            />
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={async () => {
                setError("");
                try {
                  setPreview(
                    await api("preview-import", { kind: "roster", csv }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Preview registered emails
            </button>
            {preview && (
              <button
                className="button"
                onClick={async () => {
                  try {
                    await run("commit-import", {
                      kind: "roster",
                      csv,
                      digest: preview.digest,
                    });
                    setPreview(null);
                    setEmails("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Import {preview.rows?.length} registered emails
              </button>
            )}
          </div>
          {preview && (
            <p>{preview.rows?.map((r: Row) => r.email).join(", ")}</p>
          )}
          {error && <p role="alert">{error}</p>}
        </details>
      )}
      <div className="bulk-bar">
        <strong>{selected.length} selected</strong>
        {!data.lookupOnly && (
          <label>
            <span className="sr-only">Individual approval status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Registered</option>
              <option value="approved">Going</option>
              <option value="checked">Checked in</option>
              <option value="absent">Absent</option>
            </select>
          </label>
        )}
        <label className="reason-input">
          <span className="sr-only">Reason for action</span>
          <input
            placeholder="Reason for action"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {!data.lookupOnly && (
          <button
            className="button secondary"
            disabled={!selected.length || reason.trim().length < 5}
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
          disabled={
            !selected.length ||
            reason.trim().length < 5 ||
            !data.checkInConfigured
          }
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
      {!data.checkInConfigured && (
        <p className="muted">
          {data.checkInStatus?.message || "Check-in setup is pending."} Going is
          an individual approval on this portal. Luma is registration only.
        </p>
      )}
      <div className="table-scroll">
        <table className="participants-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select visible participants"
                  checked={
                    !!items.length &&
                    items.every((r) => selected.includes(r.email))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? items.map((r) => r.email) : [],
                    )
                  }
                />
              </th>
              <th>Participant</th>
              <th>Team</th>
              <th>Approval</th>
              <th>Progress</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.email}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.email}`}
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
                  <strong>{r.name || "Not signed in yet"}</strong>
                  <small>{r.email}</small>
                </td>
                <td>
                  {r.team_name || "No team"}
                  <small>
                    {r.teamReadiness.total
                      ? `${r.teamReadiness.approved}/${r.teamReadiness.total} approved`
                      : ""}
                  </small>
                </td>
                <td>
                  {r.approval === "approved"
                    ? "Going"
                    : r.approval === "pending"
                      ? "Registered"
                      : r.approval}
                </td>
                <td>
                  <Pill tone={r.status === "Going" ? "positive" : "neutral"}>
                    {r.status}
                  </Pill>
                </td>
                <td>
                  {r.checked_in ? "Checked in" : "Not checked in"}
                  {!data.lookupOnly && r.id && (
                    <StatusChange
                      kind="person"
                      target={r.id}
                      name={r.name || r.email}
                      current={r.status}
                      run={run}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <Empty>No participants match this search.</Empty>}
    </>
  );
}
function Review({
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
        ← Submissions
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
          <p className="muted">
            {v ? `Committed version ${v.attempt}` : "Draft — not submitted"}
          </p>
          {(data.me?.owner || data.me?.role === "admin") && v && (
            <details className="panel">
              <summary>Final judging rubric · reviewer private</summary>
              <Form
                title="Record verified rubric evidence"
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
                <p className="muted">
                  No model result is invented here. Unverified evidence stays
                  unscored. This does not reveal scores.
                </p>
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
                <p>
                  Eligibility is separate from evaluation. Verified eligible
                  submissions appear automatically. Leave unverified external
                  checks pending.
                </p>
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
              await run("review-project", {
                projectId: p.id,
                versionId: v?.id,
                body: f.get("body"),
                ...(data.reviewKind === "judge"
                  ? { rating: Number(f.get("rating")) }
                  : {}),
              });
            }}
          >
            {data.reviewKind === "judge" && (
              <Field
                name="rating"
                type="number"
                label="Score · 0 to 10, reviewer-private"
                required
              />
            )}
            <Field
              name="body"
              label="Feedback for the team"
              type="textarea"
              required
            />
            <p className="muted">
              Only this team and authorized reviewers can read this feedback.
              Keep numeric scores out of team-facing copy.
            </p>
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
              <p className="muted">
                Each run is bound to a project version. Previous reviews are
                retained.
              </p>
              <button
                className="button secondary"
                disabled={
                  !data.evaluationConfigured ||
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
            {!data.history?.length && (
              <p className="muted">No saved reviews yet.</p>
            )}
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
function AdminList({
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
    [lockFilter, setLockFilter] = useState("");
  const teams = path === "/admin/teams",
    logs = path === "/admin/logs";
  const items = (data.items || []).filter(
    (r) =>
      JSON.stringify(r).toLowerCase().includes(q.toLowerCase()) &&
      (!filter || r.status === filter) &&
      (!lockFilter || (lockFilter === "locked" ? r.locked : !r.locked)),
  );
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">
          {logs
            ? "Owner only"
            : teams
              ? "Team administration"
              : "Project records"}
        </p>
        <h1>
          {logs ? "Logs" : teams ? "Teams" : "Submissions"}
          <span className="heading-dot green" />
        </h1>
      </header>
      <div className="toolbar">
        <Search
          value={q}
          onChange={setQ}
          label={teams ? "Search team or member" : "Search records"}
        />
        {!logs && (
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
            href={`/api/export?list=team-emails&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&lock=${encodeURIComponent(lockFilter)}`}
          >
            Export member emails
          </a>
        )}
        {path !== "/review" && (
          <a
            className="button secondary"
            href={`/api/export?list=${logs ? "logs" : teams ? "teams" : "submissions"}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(filter)}&lock=${encodeURIComponent(lockFilter)}`}
          >
            Export CSV
          </a>
        )}
      </div>
      {teams ? (
        <ul className="admin-team-list">
          {items.map((t) => (
            <li key={t.id}>
              <header className="section-heading">
                <div className="identity-line">
                  <TeamAvatar avatar={t.avatar} palette={t.palette} />
                  <h2>{t.name}</h2>
                  <Pill>{t.status}</Pill>
                </div>
                <Pill tone={t.readiness.allApproved ? "positive" : "waiting"}>
                  {t.status}
                </Pill>
              </header>
              <StatusChange
                kind="team"
                target={t.id}
                name={t.name}
                current={t.status}
                run={run}
              />
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
                        className="link-button"
                        onClick={() => {
                          void run("remove-workspace-member", {
                            userId: m.id,
                            reason: "Administrator updated team membership",
                          }).catch(() => {});
                        }}
                      >
                        Remove membership
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
                <span>Review project →</span>
              </a>
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
          <label>
            General venue
            <input
              value={content.venue || ""}
              onChange={(e) => update("venue", e.target.value)}
            />
          </label>
          <label>
            General Google Maps URL
            <input
              type="url"
              value={content.mapUrl || ""}
              onChange={(e) => update("mapUrl", e.target.value)}
            />
          </label>
          <p className="muted">
            IIIT Delhi is user-provided. The public Luma page exposes no
            verified Maps link.
          </p>
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
          <p className="notice">
            These fields are never included in public content or ordinary
            exports. Published details are returned only to fully approved teams
            and authorized venue managers.
          </p>
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
      <p className="muted">
        Save before publishing. Content publication does not activate event
        policies.
      </p>
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
      <h2>Deadline and global weights</h2>
      <p>
        Submission deadline: {ist(data.policy.submissionClose)}. Roster and idea
        lock: October 29 at 23:59 IST. No strict participant cap; teams remain
        at most five.
      </p>
      <Form
        title="Extend submission deadline"
        label="Preview extension"
        onSave={async (f) => {
          setError("");
          const values = {
            version: data.policyVersion,
            minutes: Number(f.get("minutes")),
          };
          const result = await api("preview-submission-extension", values);
          setPreview({
            kind: "extension",
            values: { ...values, reason: f.get("reason") },
            ...result,
          });
        }}
      >
        <Field
          name="minutes"
          type="number"
          label="Additional whole minutes"
          required
        />
        <Field name="reason" label="Reason" required minLength={5} />
      </Form>
      <Form
        title="Global scoring weights"
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
            {preview.kind === "extension" ? "New deadline: " : "All teams: "}
            <strong>{preview.label}</strong>
          </p>
          {(preview.warnings || []).map((warning: string) => (
            <p role="alert" key={warning}>
              {warning}
            </p>
          ))}
          <p>
            This creates global policy version {preview.version + 1}. Existing
            submissions are retained.
          </p>
          <button
            className="button"
            onClick={() => {
              void run(
                preview.kind === "extension"
                  ? "publish-submission-extension"
                  : "publish-policy-weights",
                { ...preview.values, preview: preview.preview },
              )
                .then(() => setPreview(null))
                .catch((e) => {
                  if (!(e instanceof ActionCancelled)) setError(e.message);
                });
            }}
          >
            Review and publish{" "}
            {preview.kind === "extension" ? "extension" : "global weights"}
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
function Settings({
  data,
  run,
}: {
  data: View;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Event setup</p>
        <h1>
          Settings
          <span className="heading-dot green" />
        </h1>
      </header>
      <section className="panel">
        <h2>Operational and scoring readiness</h2>
        {!data.readiness?.initialized && (
          <p className="notice">
            Event setup has not been saved. Profiles, teams, ideas and project
            drafts remain available.
          </p>
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
            {data.readiness?.[scope]?.blockers?.length > 0 && (
              <p className="muted">
                Required operational confirmations:{" "}
                {data.readiness[scope].blockers.join(", ")}
              </p>
            )}
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
        <p className="muted">
          Submission and check-in controls use their own operational readiness.
          Unconfirmed judging criteria keep score computation and reveals
          blocked.
        </p>
      </section>
      <details className="panel">
        <summary>Shared credit setup instructions</summary>
        <p>
          Setup steps only; assigned codes stay in each checked-in recipient’s
          private vault.
        </p>
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
      {data.me?.owner && <OwnerPolicyControls data={data} run={run} />}
      {(data.me?.owner || data.me?.role === "admin") && (
        <section className="panel">
          <h2>Score reveals</h2>
          <p>Current stage: {data.scoreRelease?.stage || "community"}</p>
          <p className="muted">
            Public actions are audited and irreversible. Real persisted scores
            and confirmed policy are required. Choose a stage only when reviews
            are complete.
          </p>
          <Form
            title="Reveal AI scores"
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
          {!data.scoringDisclosure?.confirmed && (
            <p className="muted">
              Final scoring criteria and weightage are unconfirmed. Final reveal
              is blocked.
            </p>
          )}
        </section>
      )}
      {data.me?.owner && (
        <ContentEditor
          key={`public-${data.content?.revision}`}
          data={data}
          run={run}
          scope="public"
        />
      )}
      {data.canManageVenue && (
        <ContentEditor
          key={`private-${data.venue?.revision}`}
          data={data}
          run={run}
          scope="private"
        />
      )}
      {data.me?.owner && (
        <>
          <Form
            title="Least-privilege roles"
            label="Update role"
            onSave={async (f) => {
              await run("portal-role", {
                userId: f.get("userId"),
                role: f.get("role"),
                reason: f.get("reason"),
              });
            }}
          >
            <Field name="userId" label="Person">
              <select name="userId" required>
                <option value="">Choose a signed-in person</option>
                {(data.roles || [])
                  .filter((r: Row) => r.id !== data.me?.id)
                  .map((r: Row) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.email} · {r.role}
                    </option>
                  ))}
              </select>
            </Field>
            <Field name="role" label="Role">
              <select name="role">
                {portalRoles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <p className="muted">
              Volunteers: lookup/check-in. Mentors: assigned advice. Judges:
              assigned scoring. Admins: participant, team and project
              management. Only the owner controls roles, Logs and results
              reveal.
            </p>
            <Field name="reason" label="Reason" required minLength={5} />
          </Form>
          <Form
            title="Private venue management"
            label="Update venue permission"
            onSave={async (f) => {
              await run("venue-manager", {
                userId: f.get("userId"),
                enabled: f.get("enabled") === "on",
                reason: f.get("reason"),
              });
            }}
          >
            <Field
              name="userId"
              label="Specifically authorized operational admin"
            >
              <select name="userId" required>
                <option value="">Choose an administrator</option>
                {(data.roles || [])
                  .filter((r: Row) => r.role === "admin")
                  .map((r: Row) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ·{" "}
                      {r.venue_manager
                        ? "Has venue permission"
                        : "No venue permission"}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              name="enabled"
              type="checkbox"
              label="Allow private venue management"
            />
            <Field name="reason" label="Reason" required minLength={5} />
          </Form>
        </>
      )}
    </>
  );
}
const canonical = (p: string) =>
  ({
    "/dashboard/profile": "/profile",
    "/dashboard/submission": "/submission",
    "/dashboard/team": "/dashboard",
    "/dashboard/credits": "/dashboard",
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
        setData({});
        throw new Error(
          body.message || body.code || "This page could not be loaded.",
        );
      }
      setData(body);
    } catch (e) {
      if (generation === loadGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
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
  const targetName = (values: Row) => {
    const id =
      values.targetId ||
      values.userId ||
      values.projectId ||
      values.teamId ||
      values.typeId;
    const record = [
      ...(data.items || []),
      ...(data.roles || []),
      ...(data.members || []),
      ...(data.reviewers || []),
      ...(data.actions || []),
      ...(data.creditInstructions || []),
    ].find((r: Row) => r.id === id || r.user_id === id);
    if (values.minutes && data.policy?.submissionClose)
      return `Submission deadline → ${ist(new Date(Date.parse(data.policy.submissionClose) + Number(values.minutes) * 60000).toISOString())}`;
    if (values.weights) return "Global scoring weights — all teams";
    if (values.operation)
      return values.operation === "submissions"
        ? "Submission operations"
        : "Check-in operations";
    if (values.position) return `Award ${values.position}`;
    if (values.snapshotId) return `Frozen snapshot ${values.snapshotId}`;
    if (values.scope)
      return values.scope === "private"
        ? "Private venue and directions"
        : "Public agenda, rules, FAQ and venue";
    if (values.emails) return (values.emails as string[]).join(", ");
    return (
      record?.name ||
      record?.projectName ||
      record?.person_name ||
      record?.email ||
      values.project?.projectName ||
      values.name ||
      (id
        ? String(id)
        : data.team?.name || data.me?.name || "This portal record")
    );
  };
  const run = async (action: string, values: Row) => {
    if (actionBusy.current) throw new ActionCancelled();
    actionBusy.current = true;
    try {
      if (
        !(await gate.current!.ask(
          confirmationFor(
            action,
            action === "submit-project"
              ? { ...values, attemptsUsed: data.attempts?.length || 0 }
              : values,
            action === "complete-profile"
              ? data.me?.name || "Your profile"
              : targetName(values),
          ),
        ))
      )
        throw new ActionCancelled();
      const token = revealConfirmation(action, values);
      const result = await api(
        action,
        token ? { ...values, confirmation: token } : values,
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
  // Button actions report rejected operations without unhandled promise noise.
  const clickRun = async (a: string, d: Row) => {
    try {
      return await run(a, d);
    } catch {
      return {};
    }
  };
  const admin = path.startsWith("/admin"),
    privileged = data.me?.owner || data.me?.role === "admin",
    reviewer = ["judge", "mentor"].includes(data.me?.role || "");
  const nav = admin
    ? [
        ["/admin/participants", "Participants"],
        ["/rules", "Rules"],
        ...(privileged
          ? [
              ["/admin/teams", "Teams"],
              ["/admin/submissions", "Submissions"],
              ["/admin/settings", "Settings"],
            ]
          : []),
        ...(data.me?.owner ? [["/admin/logs", "Logs"]] : []),
      ]
    : [
        ["/", "Home"],
        ["/projects", "Projects"],
        ["/leaderboard", "Leaderboard"],
        ...(data.me
          ? [
              ["/dashboard", "Dashboard"],
              ["/rules", "Rules"],
              ...(data.me.role === "participant"
                ? [
                    ["/teams", "Teams"],
                    ...(data.submissionAccess?.canAccess
                      ? [["/submission", "Submission"]]
                      : []),
                  ]
                : []),
              ...(reviewer ? [["/review", "Assigned projects"]] : []),
            ]
          : []),
      ];
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
            Menu
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
          {menu ? "Close menu" : "Menu"}
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
              aria-current={path === href ? "page" : undefined}
            >
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
              <small>{data.me.owner ? "Owner" : data.me.role}</small>
              <a href="/profile">Profile</a>
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
            <h2>This page could not load.</h2>
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => {
                void load();
              }}
            >
              Try again
            </button>
            {!data.me && (
              <a
                className="text-link"
                target="_top"
                href={`/signin-with-chatgpt?return_to=${encodeURIComponent(path)}`}
              >
                Sign in with ChatGPT
              </a>
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
          <div className="loading-state" role="status">
            <span className="loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Loading</span>
          </div>
        ) : (
          !error && (
            <>
              {data.profileIncomplete && path !== "/rules" ? (
                <Profile data={data} run={run} gated />
              ) : path === "/profile" ? (
                <Profile data={data} run={run} />
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
                <Dashboard data={data} run={clickRun} />
              ) : path === "/teams" ? (
                <Teams data={data} run={clickRun} />
              ) : path === "/submission" ? (
                <Submission
                  key={`${data.project?.revision || 0}-${data.team?.id || "none"}`}
                  data={data}
                  run={run}
                />
              ) : path.startsWith("/projects") || path === "/leaderboard" ? (
                <Projects data={data} path={path} run={clickRun} />
              ) : path === "/admin/participants" ? (
                <AdminParticipants data={data} run={run} />
              ) : path === "/admin/settings" ? (
                <Settings data={data} run={run} />
              ) : /^\/(admin\/submissions|review)\//.test(path) ? (
                <Review data={data} run={run} />
              ) : path.startsWith("/admin") || path === "/review" ? (
                <AdminList data={data} path={path} run={clickRun} />
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
}: {
  kind: "person" | "team";
  target: string;
  name: string;
  current: string;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  return (
    <details>
      <summary>Change {name} status</summary>
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
