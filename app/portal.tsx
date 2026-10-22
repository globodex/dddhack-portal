"use client";
import { useEffect, useState } from "react";
import Dots from "./dots";
import { ist } from "../lib/policy";
const nav = [
  ["/dashboard", "Overview"],
  ["/dashboard/team", "My team"],
  ["/dashboard/credits", "My credits"],
  ["/dashboard/submission", "Submit project"],
  ["/dashboard/profile", "My profile"],
];
const adminNav = [
  "participants",
  "teams",
  "check-in",
  "credits",
  "submissions",
  "astra",
  "judging",
  "votes",
  "feedback",
  "results",
  "settings",
  "permissions",
  "audit",
];
export const titles: Record<string, [string, string]> = {
  "/rules": [
    "The rules of the build.",
    "A shared starting point for a fair, thoughtful hackathon.",
  ],
  "/teams": [
    "Find your people.",
    "Small teams. Different perspectives. One day to make something matter.",
  ],
  "/projects": [
    "Made in a day.",
    "Explore the projects when the organizer opens discovery.",
  ],
  "/dashboard": [
    "Your next big thing.",
    "Your workspace for the build, from first idea to final demo.",
  ],
  "/dashboard/team": [
    "Better, together.",
    "Create your team, shape your idea, and get ready to build.",
  ],
  "/dashboard/credits": [
    "A little extra power.",
    "Your personal credit vault. Only you can reveal your allocations.",
  ],
  "/dashboard/submission": [
    "Ship your idea.",
    "A committed revision counts as one attempt. You have three.",
  ],
  "/dashboard/profile": [
    "Introduce yourself.",
    "You choose what to share. Your profile starts private.",
  ],
  "/judge": [
    "Give good judgment.",
    "Review assigned projects and leave one considered rating out of ten.",
  ],
  "/admin": [
    "Keep the day moving.",
    "A calm control room for an ambitious day.",
  ],
  "/leaderboard": [
    "The work deserves a moment.",
    "Results appear here after the owner freezes and publishes them.",
  ],
  "/winners": [
    "Built with possibility.",
    "The winner reveal is held until results are approved.",
  ],
  "/local-test": [
    "Local rehearsal only.",
    "Choose a fake account. This is not ChatGPT authentication.",
  ],
};
type Row = Record<string, unknown>;
type View = {
  me?: { id: string; name: string; role: string; owner: boolean };
  policy?: Record<string, unknown>;
  items?: Row[];
  team?: Row;
  idea?: Row;
  profile?: Row;
  members?: Row[];
  actions?: Row[];
  attempts?: Row[];
  metrics?: Row[];
  blockers?: string[];
  message?: string;
  localTest?: boolean;
  registration?: Row;
};
async function api(action: string, data: Record<string, unknown>) {
  const r = await fetch("/api/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const b = (await r.json()) as View & {
    message?: string;
    code?: string;
    value: string;
    digest: string;
    rows: Row[];
  };
  if (!r.ok) throw new Error(b.message || b.code || "Request failed");
  return b;
}
function Field({
  name,
  label,
  type = "text",
  required = true,
  value,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: unknown;
}) {
  return (
    <label>
      {label}
      {type === "textarea" ? (
        <textarea
          name={name}
          required={required}
          defaultValue={String(value ?? "")}
          rows={4}
        />
      ) : type === "checkbox" ? (
        <input name={name} type="checkbox" defaultChecked={Boolean(value)} />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={String(value ?? "")}
        />
      )}
    </label>
  );
}
function Action({
  title,
  action,
  children,
  defaults = {},
  onDone,
  label = "Save",
  danger = false,
}: {
  title: string;
  action: string;
  children?: React.ReactNode;
  defaults?: Record<string, unknown>;
  onDone: () => void;
  label?: string;
  danger?: boolean;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const f = new FormData(e.currentTarget);
        const data: Record<string, unknown> = { ...defaults };
        for (const [k, v] of f.entries()) data[k] = v;
        try {
          const result = await api(action, data);
          setMessage(result.message || "Saved.");
          onDone();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{title}</h2>
      {children}
      <button className={danger ? "button danger" : "button"} disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
      <p role="status" className="form-status">
        {message}
      </p>
    </form>
  );
}
function DataTable({ items }: { items: Row[] }) {
  if (!items.length)
    return (
      <div className="empty">
        <span>○</span>
        <h2>Nothing here just yet.</h2>
        <p>When records are ready, they’ll appear here.</p>
      </div>
    );
  const keys = Object.keys(items[0]);
  return (
    <div className="table-scroll" tabIndex={0} aria-label="Records table">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k.replaceAll("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k}>
                  {typeof r[k] === "object"
                    ? JSON.stringify(r[k])
                    : String(r[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Credits({ items }: { items: Row[] }) {
  const [revealed, setRevealed] = useState<Record<string, string>>({}),
    [msg, setMsg] = useState("");
  return (
    <div className="cards">
      {items.length ? (
        items.map((c, i) => (
          <article className="panel credit" key={i}>
            <span className="eyebrow">Personal allocation</span>
            <h2>{String(c.name)}</h2>
            <p>{String(c.instructions)}</p>
            <div className="credit-code">
              {revealed[String(c.type_id)] || "•••• •••• ••••"}
            </div>
            <button
              className="button secondary"
              disabled={!c.allocated}
              onClick={async () => {
                try {
                  const b = await api("reveal-credit", { typeId: c.type_id });
                  setRevealed({ ...revealed, [String(c.type_id)]: b.value });
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              {c.allocated ? "Reveal my credit" : "Pending allocation"}
            </button>
          </article>
        ))
      ) : (
        <div className="empty">
          <h2>Your credits are waiting for check-in.</h2>
          <p>
            Staff approval and check-in unlock available allocations. No shared
            team codes.
          </p>
        </div>
      )}
      <p role="status">{msg}</p>
    </div>
  );
}
function Importer({
  kind,
  onDone,
}: {
  kind: "roster" | "credits";
  onDone: () => void;
}) {
  const [csv, setCsv] = useState(""),
    [typeId, setTypeId] = useState(""),
    [preview, setPreview] = useState<{ digest: string; rows: Row[] } | null>(
      null,
    ),
    [msg, setMsg] = useState("");
  return (
    <section className="panel">
      <h2>
        {kind === "roster"
          ? "Import registered emails"
          : "Import credit inventory"}
      </h2>
      <p>
        Preview is required. Existing approvals are preserved. Credit values
        stay masked.
      </p>
      {kind === "credits" && (
        <label>
          Credit type ID
          <input
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setPreview(null);
            }}
          />
        </label>
      )}
      <label>
        CSV contents
        <textarea
          rows={6}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
          }}
          placeholder={
            kind === "roster"
              ? "email\nparticipant@example.test"
              : "value\nFAKE-ONLY-001"
          }
        />
      </label>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            const b = await api("preview-import", { kind, csv, typeId });
            setPreview(b);
            setMsg("Review every row before importing.");
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Preview import
      </button>
      {preview && (
        <>
          <DataTable items={preview.rows} />
          <button
            className="button"
            onClick={async () => {
              try {
                await api("commit-import", {
                  kind,
                  csv,
                  typeId,
                  digest: preview.digest,
                });
                setMsg("Import committed.");
                setPreview(null);
                onDone();
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Confirm {preview.rows.length} rows
          </button>
        </>
      )}
      <p role="status">{msg}</p>
    </section>
  );
}
function ResultsPreview() {
  const [items, setItems] = useState<Row[]>([]),
    [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h2>Private scoring preview</h2>
      <p>
        Requires complete evidence and confirmed rules. It does not freeze or
        publish results.
      </p>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            const r = await api("compute-results", {});
            setItems(r.items || []);
            setMessage("Private preview computed.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Compute staging results
      </button>
      <p role="status">{message}</p>
      {items.length > 0 && <DataTable items={items} />}
    </section>
  );
}
export default function Portal({
  path,
  localTest,
}: {
  path: string;
  localTest: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [view, setView] = useState<View>({}),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0),
    [search, setSearch] = useState("");
  const refresh = () => setTick((t) => t + 1);
  const isAdmin = path.startsWith("/admin"),
    isDash = path.startsWith("/dashboard"),
    isJudge = path.startsWith("/judge");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    fetch("/api/portal?view=" + encodeURIComponent(path))
      .then(async (r) => {
        const b = (await r.json()) as View & {
          message?: string;
          code?: string;
          value: string;
          digest: string;
          rows: Row[];
        };
        if (!r.ok) throw new Error(b.message || b.code);
        return b;
      })
      .then((b) => {
        if (current) setView(b);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, tick]);
  if (path === "/")
    return (
      <main className="landing">
        <Dots landing />
        <header className="landing-nav">
          <a className="brand" href="/">
            devday<span>exchange</span>
          </a>
          <nav aria-label="Main">
            <a href="/teams">The teams</a>
            <a href="/rules">The details →</a>
            <a
              className="nav-signin"
              href="/signin-with-chatgpt?return_to=%2Fdashboard"
              target="_top"
            >
              Sign in <span>→</span>
            </a>
          </nav>
        </header>
        <section className="hero">
          <div className="event-pill">
            <span /> NOV 01, 2026 <i /> INDIA · IST
          </div>
          <p className="hero-kicker">Good people. Big ideas. One day.</p>
          <h1>
            Build what
            <br />
            comes <em>next.</em>
          </h1>
          <p className="hero-description">
            A day to meet your people, push an idea further,
            <br className="desktop-break" /> and make something that matters.
          </p>
          <div className="hero-actions">
            <a
              className="button"
              href="/signin-with-chatgpt?return_to=%2Fdashboard"
              target="_top"
            >
              Enter the hackathon <span>→</span>
            </a>
            <a className="text-link" href="/teams">
              Explore the teams <span>→</span>
            </a>
          </div>
        </section>
        <div className="landing-bottom">
          <div className="event-stats">
            <div>
              <b>01 day</b>
              <span>to go from idea to demo</span>
            </div>
            <div>
              <b>1–5 builders</b>
              <span>one team, many perspectives</span>
            </div>
            <div>
              <b>Endless possibility</b>
              <span>bring your curiosity</span>
            </div>
          </div>
          <footer>
            <span>
              An independent community hackathon. No OpenAI endorsement implied.
            </span>
            <a href="/rules">Rules & privacy →</a>
            <span className="original-label">
              Original interactive dot artwork
            </span>
          </footer>
        </div>
        {localTest && (
          <a className="local-chip" href="/local-test">
            LOCAL TEST · fake accounts →
          </a>
        )}
      </main>
    );
  const segment = path.split("/").filter(Boolean);
  const title =
    titles[path] ??
    (isAdmin
      ? [
          `Event ${segment[1]?.replaceAll("-", " ") || "operations"}.`,
          "Private staff tools. Every change is authorized and recorded.",
        ]
      : isJudge
        ? [
            "Take a closer look.",
            "The evidence, the project, and your considered rating.",
          ]
        : segment[0] === "teams"
          ? [
              "Meet the team.",
              "A shared idea starts with the people behind it.",
            ]
          : segment[0] === "projects"
            ? [
                "From idea to reality.",
                "Try the project and share specific, useful feedback.",
              ]
            : ["Page not found.", "This route does not exist."]);
  const variant = Array.from(path).reduce((a, c) => a + c.charCodeAt(0), 0);
  const filtered = (view.items || []).filter((r) =>
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="/">
          devday<span>exchange</span>
        </a>
        <nav aria-label="Main">
          <a href="/teams">Teams</a>
          <a href="/projects">Projects</a>
          <a href="/rules">Guide</a>
          <a href="/dashboard" className="nav-signin">
            My workspace →
          </a>
        </nav>
      </header>
      <div className="workspace">
        {(isDash || isAdmin || isJudge) && (
          <aside>
            <a className="workspace-label" href="/dashboard">
              THE BUILD WORKSPACE
            </a>
            <nav aria-label="Workspace">
              {(isAdmin
                ? [
                    ["/admin", "Overview"],
                    ...adminNav.map((n) => [
                      "/admin/" + n,
                      n.replaceAll("-", " "),
                    ]),
                  ]
                : isJudge
                  ? [["/judge", "Assigned projects"]]
                  : nav
              ).map(([url, label]) => (
                <a
                  href={url}
                  key={url}
                  aria-current={path === url ? "page" : undefined}
                >
                  {label}
                  <span>→</span>
                </a>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <span>01 NOV 2026 · IST</span>
              <a href="/admin">Staff console →</a>
              <a href="/judge">Judge workspace →</a>
            </div>
          </aside>
        )}
        <main id="content" className="content">
          <div className="page-intro">
            <div>
              <p className="eyebrow">
                DEVDAY EXCHANGE /{" "}
                {isAdmin
                  ? "CONTROL ROOM"
                  : isDash
                    ? "YOUR WORKSPACE"
                    : isJudge
                      ? "JUDGING"
                      : "THE HACKATHON"}
              </p>
              <h1>{title[0]}</h1>
              <p>{title[1]}</p>
            </div>
            <Dots variant={variant} />
          </div>
          {localTest && (
            <div className="notice local">
              <b>Local test adapter</b> · Fake accounts and local SQLite.{" "}
              <a href="/local-test">Switch fixture →</a>
            </div>
          )}
          {view.me && (
            <div className="identity">
              <span className="avatar">{view.me.name.slice(0, 1)}</span>
              <span>
                {view.me.name}
                <small>
                  {view.me.owner ? "Owner rehearsal" : view.me.role} ·{" "}
                  {view.registration
                    ? String(view.registration.status)
                    : "not registered"}
                </small>
              </span>
              <a href="/signout-with-chatgpt?return_to=%2F" target="_top">
                Sign out →
              </a>
            </div>
          )}
          {error && (
            <div className="notice" role="alert">
              {error}{" "}
              <a
                href="/signin-with-chatgpt?return_to=%2Fdashboard"
                target="_top"
              >
                Sign in with ChatGPT →
              </a>
            </div>
          )}
          {loading && <p role="status">Loading workspace…</p>}
          {path === "/rules" && (
            <div className="cards rules">
              <article className="panel">
                <span className="eyebrow">01 / BEFORE THE BUILD</span>
                <h2>A clear starting line.</h2>
                <p>
                  Teams have 1–5 approved participants. Each person can join one
                  active team.
                </p>
                <p>
                  Idea lock: <b>28 October, 11:59 PM IST.</b>
                  <br />
                  Membership freeze: <b>29 October, 11:59 PM IST.</b>
                </p>
                <p>
                  Ideas stay private until the configured November 1 reveal.
                  Descriptions may improve without changing the locked core
                  idea.
                </p>
              </article>
              <article className="panel">
                <span className="eyebrow">02 / THE DAY ITSELF</span>
                <h2>Build it. Show it. Own it.</h2>
                <p>
                  Public GitHub repository creation and first commit must fall
                  on 1 November 2026 IST. Ambiguous evidence receives human
                  review.
                </p>
                <p>
                  Team leaders have three committed submission attempts. The
                  final cutoff is awaiting owner confirmation.
                </p>
              </article>
              <article className="panel">
                <span className="eyebrow">03 / FAIR PLAY</span>
                <h2>Thoughtful judging.</h2>
                <p>
                  Proposed composition: human 50 · AI 30 · votes 5 · diversity
                  10 · Codex 5, plus up to 5 feedback bonus.
                </p>
                <p>
                  Scoring remains disabled until unresolved policies are
                  approved. Unknown AI evidence never becomes an automatic zero
                  or deduction.
                </p>
              </article>
              <article className="panel">
                <span className="eyebrow">04 / YOUR PRIVACY</span>
                <h2>Share on your terms.</h2>
                <p>
                  Profiles start private. Gender is optional, includes prefer
                  not to say, and is never inferred or used for automatic
                  scoring. Personal credits are visible only to their recipient
                  through the vault.
                </p>
                <p>
                  No emails are sent. Luma changes are manual. Contact and
                  retention details require organizer confirmation before live
                  activation.
                </p>
              </article>
            </div>
          )}
          {path === "/local-test" && localTest && (
            <section className="panel">
              <h2>Fake fixture accounts</h2>
              <p>
                No production credentials or real users. The owner fixture uses
                owner@portal.test.
              </p>
              <div className="fixture-list">
                {[
                  "owner",
                  "admin",
                  "judge",
                  "judge2",
                  "alice",
                  "bob",
                  "carol",
                  "dave",
                  "eve",
                  "frank",
                  "pending",
                  "stranger",
                ].map((id) => (
                  <button
                    className="button secondary"
                    key={id}
                    disabled={!hydrated}
                    onClick={async () => {
                      try {
                        await api("local-signin", { fixture: id });
                        location.href = "/dashboard";
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {id} →
                  </button>
                ))}
              </div>
            </section>
          )}
          {!loading && !error && path === "/dashboard" && (
            <>
              <div className="metric-grid">
                <article className="panel">
                  <span className="eyebrow">YOUR TEAM</span>
                  <h2>{String(view.team?.name || "Find your people")}</h2>
                  <a href="/dashboard/team">Open team workspace →</a>
                </article>
                <article className="panel">
                  <span className="eyebrow">NEXT DEADLINE</span>
                  <h2>28 Oct · 11:59 PM</h2>
                  <p>Idea lock · Asia/Kolkata</p>
                </article>
                <article className="panel">
                  <span className="eyebrow">YOUR ALLOCATION</span>
                  <h2>Private by design.</h2>
                  <a href="/dashboard/credits">Visit my credits →</a>
                </article>
              </div>
              <section className="panel next-step">
                <span className="eyebrow">MAKE ROOM FOR POSSIBILITY</span>
                <h2>Great things start with a small team.</h2>
                <p>
                  Finish your profile, connect with builders, and write down the
                  idea you want to bring to life.
                </p>
                <a className="button" href="/dashboard/team">
                  Let’s get building →
                </a>
              </section>
              <div className="notice">
                Event policies are in draft. Submission cutoff and scoring rules
                await owner confirmation.
              </div>
            </>
          )}
          {!error && path === "/dashboard/profile" && (
            <Action title="Your profile" action="profile" onDone={refresh}>
              <Field
                name="bio"
                label="A little about you"
                type="textarea"
                required={false}
                value={view.profile?.bio}
              />
              <Field
                name="socials"
                label="Public HTTPS social links (one per line)"
                type="textarea"
                required={false}
                value={
                  Array.isArray(view.profile?.socials)
                    ? view.profile?.socials.join("\n")
                    : ""
                }
              />
              <label>
                Gender (optional, private)
                <select
                  name="gender"
                  defaultValue={String(
                    view.profile?.gender || "prefer-not-to-say",
                  )}
                >
                  <option value="prefer-not-to-say">Prefer not to say</option>
                  <option value="woman">Woman</option>
                  <option value="man">Man</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="self-described">Self described</option>
                </select>
              </label>
              <Field
                name="genderDescription"
                label="Self description (optional, private)"
                required={false}
                value={view.profile?.gender_description}
              />
              <Field
                name="public"
                label="I consent to make my name, bio and social links public"
                type="checkbox"
                value={view.profile?.public}
              />
            </Action>
          )}
          {!error && path === "/dashboard/team" && (
            <div className="cards">
              {!view.team ? (
                <Action
                  title="Start your team"
                  action="create-team"
                  onDone={refresh}
                  label="Create team →"
                >
                  <Field name="name" label="Team name" />
                  <Field
                    name="bio"
                    label="What brings you together?"
                    type="textarea"
                    required={false}
                  />
                </Action>
              ) : (
                <>
                  <section className="panel">
                    <span className="eyebrow">YOUR TEAM</span>
                    <h2>{String(view.team.name)}</h2>
                    <p>
                      Team ID: <code>{String(view.team.id)}</code>
                    </p>
                    <DataTable items={view.members || []} />
                  </section>
                  <Action
                    title="Your idea"
                    action="idea"
                    defaults={{ teamId: view.team.id }}
                    onDone={refresh}
                  >
                    <Field
                      name="title"
                      label="Idea title · locks 28 Oct"
                      value={view.idea?.title}
                    />
                    <Field
                      name="core"
                      label="Core idea · locks 28 Oct"
                      type="textarea"
                      value={view.idea?.core}
                    />
                    <Field
                      name="description"
                      label="Description · can improve after lock"
                      type="textarea"
                      value={view.idea?.description}
                    />
                  </Action>
                  <Action
                    title="Invite a registered builder"
                    action="team-invite"
                    defaults={{ teamId: view.team.id }}
                    onDone={refresh}
                  >
                    <Field
                      name="email"
                      type="email"
                      label="Registered email address"
                    />
                  </Action>
                </>
              )}
              {!view.team && (
                <Action
                  title="Ask to join a team"
                  action="team-request"
                  onDone={refresh}
                >
                  <Field name="teamId" label="Team ID" />
                </Action>
              )}
              <section className="panel">
                <h2>Invites and requests</h2>
                <DataTable items={view.actions || []} />
                {(view.actions || [])
                  .filter((a) => a.status === "pending")
                  .map((a) => (
                    <Action
                      title={String(a.kind)}
                      action="team-respond"
                      defaults={{ id: a.id }}
                      onDone={refresh}
                      key={String(a.id)}
                    >
                      <label>
                        Decision
                        <select name="decision">
                          <option value="accepted">Accept</option>
                          <option value="declined">Decline</option>
                        </select>
                      </label>
                    </Action>
                  ))}
              </section>
            </div>
          )}
          {!error && path === "/dashboard/credits" && (
            <Credits items={view.items || []} />
          )}
          {!error && path === "/dashboard/submission" && (
            <>
              <div className="notice">
                <b>{view.attempts?.length || 0}/3 committed attempts.</b>{" "}
                Cutoff:{" "}
                {view.policy?.submissionClose
                  ? ist(String(view.policy.submissionClose))
                  : "Awaiting owner confirmation · submissions blocked"}
              </div>
              <Action
                title="Final project submission"
                action="submit"
                onDone={refresh}
                label="Commit a submission attempt"
              >
                <Field name="projectName" label="Project name" />
                <Field
                  name="problemSolution"
                  label="Problem and solution (maximum 500 characters)"
                  type="textarea"
                />
                <Field
                  name="description"
                  label="What did you build?"
                  type="textarea"
                />
                <Field
                  name="github"
                  label="Public GitHub repository"
                  type="url"
                />
                <Field
                  name="demo"
                  label="Live HTTPS demo (optional)"
                  type="url"
                  required={false}
                />
                <Field
                  name="video"
                  label="Demo video URL (optional)"
                  type="url"
                  required={false}
                />
                <Field
                  name="gtm"
                  label="Go-to-market and sustainability plan"
                  type="textarea"
                />
                <Field
                  name="features"
                  label="Features and technical implementation"
                  type="textarea"
                />
                <Field name="tools" label="OpenAI tools used (self-reported)" />
                <Field
                  name="toolEffectiveness"
                  label="How the tools helped"
                  type="textarea"
                />
                <Field
                  name="contributions"
                  label={
                    'Per-member contributions as JSON: [{"userId":"…","role":"…","codex":"…"}]'
                  }
                  type="textarea"
                />
                <label>
                  Claim OpenAI API use?
                  <select name="openaiClaim">
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
                <Field
                  name="openaiEvidence"
                  label="OpenAI API models, feature path and redacted evidence (if claimed)"
                  type="textarea"
                  required={false}
                />
                <label>
                  Claim Cerebras API use?
                  <select name="cerebrasClaim">
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
                <Field
                  name="cerebrasEvidence"
                  label="Cerebras models, feature path and redacted evidence (if claimed)"
                  type="textarea"
                  required={false}
                />
                <Field
                  name="attestation"
                  label="I confirm this is original work and these claims are accurate"
                  type="checkbox"
                />
              </Action>
              <DataTable items={view.attempts || []} />
            </>
          )}
          {!error && (path === "/teams" || path === "/projects") && (
            <>
              <label className="search">
                Find a {path === "/teams" ? "team" : "project"}
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name…"
                />
              </label>
              <div className="cards">
                {filtered.map((r, i) => (
                  <a
                    href={path + "/" + String(r.id)}
                    className="panel directory-card"
                    key={i}
                  >
                    <span className="eyebrow">
                      {path === "/teams"
                        ? "MEET THE BUILDERS"
                        : "EXPLORE THE PROJECT"}
                    </span>
                    <h2>{String(r.name || r.projectName)}</h2>
                    <p>
                      {String(
                        r.bio ||
                          r.problemSolution ||
                          "An idea, a team, a new possibility.",
                      )}
                    </p>
                    <span>Take a look →</span>
                  </a>
                ))}
              </div>
              {!filtered.length && (
                <div className="empty">
                  <h2>
                    {view.message || "The next great idea is on its way."}
                  </h2>
                  <p>Check back as teams get ready for the build.</p>
                </div>
              )}
            </>
          )}
          {!error && segment.length === 2 && segment[0] === "teams" && (
            <>
              <DataTable items={view.items || []} />
              <DataTable items={view.members || []} />
              {view.idea && (
                <section className="panel">
                  <h2>{String(view.idea.title)}</h2>
                  <p>{String(view.idea.core)}</p>
                  <p>{String(view.idea.description)}</p>
                </section>
              )}
            </>
          )}
          {!error && segment.length === 2 && segment[0] === "projects" && (
            <>
              <DataTable items={view.items || []} />
              <div className="cards">
                <Action
                  title="Give this project a vote"
                  action="vote"
                  defaults={{ teamId: segment[1] }}
                  onDone={refresh}
                  label="Vote →"
                >
                  <p>
                    Three distinct votes total. You can’t vote for your own
                    team. Committed votes cannot be changed.
                  </p>
                </Action>
                <Action
                  title="Helpful, specific feedback"
                  action="feedback"
                  defaults={{ teamId: segment[1] }}
                  onDone={refresh}
                >
                  <Field
                    name="text"
                    label="What worked, what failed, and what could improve?"
                    type="textarea"
                  />
                </Action>
              </div>
            </>
          )}
          {!error && isJudge && (
            <>
              <DataTable items={view.items || []} />
              {segment[1] && (
                <Action
                  title="Your overall rating"
                  action="judge-score"
                  defaults={{ teamId: segment[1] }}
                  onDone={refresh}
                >
                  <Field name="rating" label="Rating out of 10" type="number" />
                  <Field
                    name="notes"
                    label="Evidence and constructive notes"
                    type="textarea"
                    required={false}
                  />
                </Action>
              )}
              {!segment[1] &&
                (view.items || []).map((r) => (
                  <a
                    className="button secondary"
                    key={String(r.id)}
                    href={"/judge/" + r.id}
                  >
                    Review {String(r.name)} →
                  </a>
                ))}
            </>
          )}
          {!error && isAdmin && (
            <>
              {path === "/admin" && (
                <div className="metric-grid">
                  {(view.metrics || []).map((m, i) => (
                    <article className="panel" key={i}>
                      <span className="eyebrow">{String(m.label)}</span>
                      <h2>{String(m.value)}</h2>
                    </article>
                  ))}
                </div>
              )}
              {segment[1] && (
                <div className="list-toolbar">
                  <label>
                    Search records
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <a
                    className="button secondary"
                    href={"/api/export?list=" + segment[1]}
                  >
                    Export safe CSV ↓
                  </a>
                </div>
              )}
              <DataTable items={filtered} />
              <div className="cards">
                {segment[1] === "participants" && (
                  <>
                    <Importer kind="roster" onDone={refresh} />
                    <Action
                      title="Review an account"
                      action="registration"
                      onDone={refresh}
                    >
                      <Field
                        name="email"
                        label="Verified account email"
                        type="email"
                      />
                      <label>
                        Status
                        <select name="status">
                          <option value="approved">Approved</option>
                          <option value="pending">Pending</option>
                          <option value="rejected">Rejected</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                      <Field
                        name="lumaConfirmed"
                        label="Approval manually confirmed in Luma"
                        type="checkbox"
                      />
                      <Field name="reason" label="Reason" />
                    </Action>
                  </>
                )}
                {segment[1] === "check-in" && (
                  <Action
                    title="Check in a participant"
                    action="check-in"
                    onDone={refresh}
                  >
                    <Field name="userId" label="Participant ID" />
                    <Field name="reason" label="Verification note" />
                  </Action>
                )}
                {segment[1] === "credits" && (
                  <>
                    <Action
                      title="Create a credit type"
                      action="credit-type"
                      onDone={refresh}
                    >
                      <Field name="name" label="Name" />
                      <Field
                        name="instructions"
                        label="Redemption instructions"
                        type="textarea"
                      />
                    </Action>
                    <Importer kind="credits" onDone={refresh} />
                    <Action
                      title="Retry pending allocations"
                      action="allocate"
                      onDone={refresh}
                    >
                      <Field name="userId" label="Checked-in participant ID" />
                    </Action>
                  </>
                )}
                {segment[1] === "permissions" && (
                  <>
                    <Action
                      title="Owner: appoint or revoke admin"
                      action="role"
                      onDone={refresh}
                    >
                      <Field
                        name="userId"
                        label="Existing verified account ID"
                      />
                      <label>
                        Role
                        <select name="role">
                          <option value="participant">
                            Participant (revoke staff access)
                          </option>
                          <option value="admin">Admin</option>
                          <option value="judge">Judge</option>
                        </select>
                      </label>
                      <Field name="reason" label="Reason" />
                    </Action>
                    <Action
                      title="Owner: assign a judge"
                      action="assign-judge"
                      onDone={refresh}
                    >
                      <Field name="judgeId" label="Judge account ID" />
                      <Field name="teamId" label="Team ID" />
                      <Field name="reason" label="Reason" />
                    </Action>
                  </>
                )}
                {segment[1] === "settings" && (
                  <>
                    <section className="panel">
                      <h2>Policy decisions still required</h2>
                      <ul>
                        {view.blockers?.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                      <pre>{JSON.stringify(view.policy, null, 2)}</pre>
                    </section>
                    <Action
                      title="Owner: save draft policies"
                      action="settings"
                      onDone={refresh}
                    >
                      <Field
                        name="policy"
                        label="Complete policy JSON (confirm each decision explicitly)"
                        type="textarea"
                        value={JSON.stringify(view.policy, null, 2)}
                      />
                      <Field name="reason" label="Decision record" />
                    </Action>
                    <Action
                      title="Owner: activate confirmed policy"
                      action="activate"
                      onDone={refresh}
                      danger
                      label="Activate event"
                    >
                      <p>
                        This is blocked while any policy is unresolved.
                        Activation freezes policy editing in v1.
                      </p>
                      <Field name="reason" label="Approval reason" />
                    </Action>
                  </>
                )}
                {segment[1] === "astra" && (
                  <Action
                    title="Run one review job"
                    action="astra-run"
                    onDone={refresh}
                  >
                    <Field name="jobId" label="Job ID" />
                    <p>
                      External calls are disabled. The default evaluator records
                      UNKNOWN and requires human review.
                    </p>
                  </Action>
                )}
                {segment[1] === "judging" && (
                  <Action
                    title="Staff review: evidence and score components"
                    action="review"
                    onDone={refresh}
                  >
                    <Field name="teamId" label="Team ID" />
                    <Field
                      name="versionId"
                      label="Latest submission version ID"
                    />
                    <label>
                      Eligibility
                      <select name="eligibility">
                        <option value="needs_review">Needs review</option>
                        <option value="eligible">Eligible</option>
                        <option value="ineligible">Ineligible</option>
                      </select>
                    </label>
                    <Field
                      name="astra"
                      label="AI score 0–30 (human reviewed under approved fallback)"
                      type="number"
                    />
                    <Field name="codex" label="Codex 0–5" type="number" />
                    <Field
                      name="diversity"
                      label="Approved non-demographic diversity rubric 0–10"
                      type="number"
                    />
                    <Field
                      name="falseClaims"
                      label="Human-confirmed false API claims (0, 1 or 2)"
                      type="number"
                      value="0"
                    />
                    <Field
                      name="evidence"
                      label="Evidence and appeal resolution"
                      type="textarea"
                    />
                    <Field name="reason" label="Review reason" />
                  </Action>
                )}
                {segment[1] === "feedback" && (
                  <Action
                    title="Moderate feedback"
                    action="moderate-feedback"
                    onDone={refresh}
                  >
                    <Field name="authorId" label="Author ID" />
                    <Field name="teamId" label="Team ID" />
                    <label>
                      Decision
                      <select name="valid">
                        <option value="false">Invalidate</option>
                        <option value="true">Restore</option>
                      </select>
                    </label>
                    <Field name="reason" label="Reason" />
                  </Action>
                )}
                {segment[1] === "results" && (
                  <>
                    <ResultsPreview />
                    <Action
                      title="Owner: freeze private results"
                      action="freeze-results"
                      onDone={refresh}
                    >
                      <p>
                        Requires confirmed policy, completed reviews, judge
                        coverage and resolved ties.
                      </p>
                      <Field name="reason" label="Final review reason" />
                    </Action>
                    <Action
                      title="Owner: publish frozen results"
                      action="publish-results"
                      onDone={refresh}
                      danger
                      label="Publish results"
                    >
                      <Field name="snapshotId" label="Frozen snapshot ID" />
                      <Field name="reason" label="Publication approval" />
                    </Action>
                  </>
                )}
              </div>
            </>
          )}
          {!error && (path === "/leaderboard" || path === "/winners") && (
            <>
              <DataTable items={view.items || []} />
              <p>{view.message}</p>
            </>
          )}
          <footer className="workspace-footer">
            <span>Made for the people who build.</span>
            <span>
              Independent community event · <a href="/rules">Rules & privacy</a>
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
