import { CalendarDays, Check, CircleCheck, LockKeyhole } from "lucide-react";

export type TeamPreparationProps = {
  hasTeam: boolean;
  ideaSaved: boolean;
  locked: boolean;
  memberProfilesComplete?: boolean;
  approvalTotal?: number;
  approvalGoing?: number;
};

/** Presentation only. The displayed preparation deadline never changes policy. */
export default function TeamPreparation({
  hasTeam,
  ideaSaved,
  locked,
  memberProfilesComplete,
  approvalTotal,
  approvalGoing,
}: TeamPreparationProps) {
  const complete = [hasTeam, hasTeam && (ideaSaved || locked), hasTeam && locked];
  const current = complete.findIndex((done) => !done);
  const approved =
    hasTeam &&
    Number.isInteger(approvalTotal) &&
    Number.isInteger(approvalGoing) &&
    Number(approvalTotal) > 0 &&
    approvalGoing === approvalTotal;
  const steps = [
    { title: "Create your team", detail: "Even if you’re solo" },
    { title: "Submit your idea" },
    {
      title: "Lock your team",
      detail: !locked && memberProfilesComplete !== true
        ? memberProfilesComplete === false
          ? "Complete every member’s profile first."
          : "Every member needs a complete profile."
        : undefined,
    },
  ];

  return (
    <section className="team-preparation" aria-label="Team preparation">
      <div className="team-preparation-main">
        <header className="team-preparation-heading">
          <h2>Get your team ready</h2>
          <p className="team-preparation-deadline">
            <CalendarDays size={19} aria-hidden="true" />
            <span>
              Lock by{" "}
              <time dateTime="2026-10-28T23:59:00+05:30">
                28 October 2026{" "}
                <span className="team-preparation-deadline-time">11:59 PM IST</span>
              </time>
            </span>
          </p>
        </header>
        <ol className="team-preparation-steps" aria-label="Team preparation progress">
          {steps.map((step, index) => (
            <li
              key={step.title}
              aria-current={current === index ? "step" : undefined}
              data-state={complete[index] ? "complete" : current === index ? "current" : "pending"}
            >
              <span className="team-preparation-marker" aria-hidden="true">
                {complete[index] ? <Check size={21} strokeWidth={2.4} /> : index + 1}
              </span>
              <div className="team-preparation-step-copy">
                <h3>{step.title}</h3>
                {step.detail && <p>{step.detail}</p>}
                <span className="team-preparation-sr-only">
                  {complete[index] ? "Completed" : current === index ? "Current step" : "Not completed"}
                </span>
              </div>
            </li>
          ))}
        </ol>
        <p className="team-preparation-lock-note">
          <LockKeyhole size={18} aria-hidden="true" />
          <span>
            While locked, you can’t change the team, members or idea. An admin can unlock eligible teams.
          </span>
        </p>
      </div>
      <aside className="team-preparation-approval" aria-label="Team approval">
        <span className="team-preparation-approval-icon" aria-hidden="true">
          <CircleCheck size={27} strokeWidth={1.8} />
        </span>
        <div>
          <h3>{approved ? "Team approved" : "Team approval"}</h3>
          <p>Your team is approved when every member is marked Going.</p>
          <p>
            Venue details and rules will be shared in the portal. Be ready with your idea. All the best!
            <em>~ Codex Ambassadors</em>
          </p>
        </div>
      </aside>
    </section>
  );
}
