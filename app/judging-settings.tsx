"use client";
import { SETTINGS_WRITE_CONTRACT } from "../lib/settings-contract";
import { useId, useState } from "react";
import { ChevronDown, Save } from "lucide-react";
import type { Policy } from "../lib/policy";
import { istInputToUTC, utcToISTInput } from "./owner-submission-window";
import { useAdminOperation } from "./admin-participant-actions";
import { useHydrated } from "./use-hydrated";
import type { ResultsRun } from "./result-visibility";
type Row = Record<string, any>;
type Inputs = Record<string, string>;
const string = (value: unknown) => (typeof value === "string" ? value : "");
const istInput = (value: unknown) => {
  try {
    return utcToISTInput(string(value));
  } catch {
    return "";
  }
};
const audiences = [
  ["all-signed-in", "All signed-in participants"],
  ["other-team", "Other teams"],
  [
    "approved-checked-in-other-team",
    "Going and checked-in participants from other teams",
  ],
] as const;
export function judgingSettingsValues(
  policy: Policy,
  input: Inputs,
): { policy: Policy; errors?: never } | { errors: Inputs; policy?: never } {
  const errors: Inputs = {};
  const value = (key: string) => string(input[key]).trim();
  const dates: Record<string, string> = {};
  for (const [key, label] of [
    ["judgingClose", "judging close"],
    ["engagementOpen", "feedback opening"],
    ["engagementClose", "feedback close"],
    ["appealClose", "appeal close"],
  ]) {
    if (!(key in input)) continue;
    try {
      dates[key] =
        value(key) === istInput(policy[key as keyof Policy]) &&
        typeof policy[key as keyof Policy] === "string"
          ? (policy[key as keyof Policy] as string)
          : istInputToUTC(value(key));
    } catch {
      errors[key] = `Enter a valid ${label} date and time in IST.`;
    }
  }
  if (
    dates.judgingClose &&
    (!policy.submissionClose ||
      Date.parse(dates.judgingClose) <= Date.parse(policy.submissionClose))
  )
    errors.judgingClose = "Judging must close after submissions close.";
  if (
    dates.engagementOpen &&
    Date.parse(dates.engagementOpen) < Date.parse(policy.ideaReveal)
  )
    errors.engagementOpen = "Feedback cannot open before ideas are revealed.";
  if (
    dates.engagementClose &&
    dates.engagementOpen &&
    Date.parse(dates.engagementClose) <= Date.parse(dates.engagementOpen)
  )
    errors.engagementClose = "Feedback must close after it opens.";
  if (
    dates.appealClose &&
    dates.judgingClose &&
    Date.parse(dates.appealClose) > Date.parse(dates.judgingClose)
  )
    errors.appealClose = "Appeals must close by judging close.";
  for (const key of [
    "diversityRubric",
    "codexReviewer",
    "aiFallback",
    "tieBreak",
    "criteria",
    "weightage",
  ])
    if (!value(key)) errors[key] = "Enter this judging setting.";
  for (const [key, max] of [
    ["diversityRubric", 4000],
    ["codexReviewer", 500],
    ["aiFallback", 4000],
    ["tieBreak", 2000],
    ["criteria", 4000],
    ["weightage", 4000],
  ] as const)
    if (value(key).length > max) errors[key] = `Use at most ${max} characters.`;
  if (value("diversityAssessment") !== "non-demographic-evidence")
    errors.diversityAssessment = "Choose the non-demographic assessment.";
  if (!["sqrt-relative", "fixed-target"].includes(value("voteFormula")))
    errors.voteFormula = "Choose a vote formula.";
  if (
    !["display-only", "score-with-approved-normalization"].includes(
      value("projectEngagementRule"),
    )
  )
    errors.projectEngagementRule = "Choose how public engagement is used.";
  const numbers: Record<string, number> = {};
  for (const [key, min, max] of [
    ["minJudges", 1, 1000],
    ["voteTarget", 1, 160],
    ["feedbackTarget", 1, 160],
    ["feedbackMin", 30, 500],
    ["feedbackMax", 30, 500],
  ] as const) {
    const raw = key === "feedbackMin" ? "30" : key === "feedbackTarget" ? String(policy.feedbackTarget) : value(key);
    const number = Number(raw);
    if (
      !raw ||
      !Number.isInteger(number) ||
      number < min ||
      number > max
    )
      errors[key] = `Enter a whole number from ${min} to ${max}.`;
    else numbers[key] = number;
  }
  if (numbers.feedbackMin > numbers.feedbackMax)
    errors.feedbackMax = "Maximum length must be at least the minimum.";
  let qualification = policy.engagementQualification;
  if (value("projectEngagementRule") === "score-with-approved-normalization") {
    for (const key of ["voters", "feedbackAuthors"])
      if (!audiences.some(([choice]) => choice === value(key)))
        errors[key] = "Choose an audience.";
    if (value("feedbackReview") !== "staff-qualified")
      errors.feedbackReview = "Choose staff qualification.";
    if (
      !["staff-reviewed", "exclude-exact-normalized-copies"].includes(
        value("feedbackDuplicates"),
      )
    )
      errors.feedbackDuplicates = "Choose duplicate handling.";
    qualification = {
      confirmed: qualification?.confirmed ?? false,
      version: qualification?.version ?? 1,
      voters: value("voters") as NonNullable<
        Policy["engagementQualification"]
      >["voters"],
      feedbackAuthors: value("feedbackAuthors") as NonNullable<
        Policy["engagementQualification"]
      >["feedbackAuthors"],
      feedbackReview: "staff-qualified",
      feedbackDuplicates: value("feedbackDuplicates") as NonNullable<
        Policy["engagementQualification"]
      >["feedbackDuplicates"],
    };
  }
  if (Object.keys(errors).length) return { errors };
  const next: Policy = {
    ...policy,
    ...dates,
    diversityRubric: value("diversityRubric"),
    diversityAssessment: "non-demographic-evidence",
    codexReviewer: value("codexReviewer"),
    aiFallback: value("aiFallback"),
    tieBreak: value("tieBreak"),
    voteFormula: value("voteFormula") as Policy["voteFormula"],
    minJudges: numbers.minJudges,
    voteTarget: numbers.voteTarget,
    feedbackTarget: policy.feedbackTarget,
    feedbackMin: 30,
    feedbackMax: numbers.feedbackMax,
    projectEngagementRule: value(
      "projectEngagementRule",
    ) as Policy["projectEngagementRule"],
    scoringDisclosure: {
      criteria: value("criteria"),
      weightage: value("weightage"),
      confirmed: policy.scoringDisclosure?.confirmed ?? false,
    },
    engagementQualification: qualification,
  };
  if (
    policy.engagementQualification &&
    qualification &&
    (JSON.stringify(qualification) !==
      JSON.stringify(policy.engagementQualification) ||
      ["engagementOpen", "engagementClose", "feedbackMin", "feedbackMax"].some(
        (key) => next[key as keyof Policy] !== policy[key as keyof Policy],
      ))
  )
    next.engagementQualification = {
      ...qualification,
      version: policy.engagementQualification.version + 1,
    };
  return { policy: next };
}
export default function JudgingSettings({
  data,
  run,
  initiallyOpen = false,
}: {
  data: Row;
  run: ResultsRun;
  initiallyOpen?: boolean;
}) {
  const hydrated = useHydrated(),
    id = useId(),
    [open, setOpen] = useState(initiallyOpen),
    [rule, setRule] = useState(
      data.policy?.projectEngagementRule || "unconfirmed",
    ),
    [errors, setErrors] = useState<Inputs>({});
  const { busy, error, execute, clearError } = useAdminOperation();
  if (!data.me?.owner || !data.policy) return null;
  const policy = data.policy as Policy,
    frozen = (data.resultSnapshots || []).length > 0;
  const changed = (key: string) => {
    clearError();
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const field = (
    key: string,
    label: string,
    kind: "text" | "date" | "number" | "textarea" = "text",
    options?: { min?: number; max?: number; wide?: boolean; value?: unknown },
  ) => {
    const current =
      options && "value" in options
        ? options.value
        : policy[key as keyof Policy];
    const common = {
      name: key,
      required: true,
      maxLength:
        ({ codexReviewer: 500, tieBreak: 2000 } as Record<string, number>)[
          key
        ] || (kind === "textarea" ? 4000 : undefined),
      defaultValue:
        kind === "date"
          ? istInput(current)
          : current == null
            ? ""
            : String(current),
      "aria-invalid": !!errors[key] || undefined,
      "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined,
      onChange: () => changed(key),
    };
    return (
      <label
        className={`results-ui-field${options?.wide ? " results-ui-wide" : ""}`}
        key={key}
      >
        <span>
          {label}{" "}
          <span className="results-ui-required" aria-hidden="true">
            *
          </span>
        </span>
        {kind === "textarea" ? (
          <textarea {...common} rows={3} />
        ) : (
          <input
            {...common}
            type={kind === "date" ? "datetime-local" : kind}
            step={kind === "date" ? 60 : kind === "number" ? 1 : undefined}
            min={options?.min}
            max={options?.max}
          />
        )}{" "}
        {errors[key] && (
          <span className="results-ui-fieldError" id={`${id}-${key}-error`}>
            {errors[key]}
          </span>
        )}
      </label>
    );
  };
  const select = (
    key: string,
    label: string,
    choices: readonly (readonly string[])[],
    current: unknown,
  ) => (
    <label className="results-ui-field" key={key}>
      <span>
        {label}{" "}
        <span className="results-ui-required" aria-hidden="true">
          *
        </span>
      </span>
      <select
        name={key}
        required
        defaultValue={string(current)}
        aria-invalid={!!errors[key] || undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(event) => {
          changed(key);
          if (key === "projectEngagementRule") setRule(event.target.value);
        }}
      >
        <option value="">Choose…</option>
        {["unconfirmed", ""].includes(string(current)) &&
          string(current) !== "" && (
            <option value="unconfirmed">Choose…</option>
          )}
        {choices.map(([value, label]) => (
          <option value={value} key={value}>
            {label}
          </option>
        ))}
      </select>
      {errors[key] && (
        <span className="results-ui-fieldError" id={`${id}-${key}-error`}>
          {errors[key]}
        </span>
      )}
    </label>
  );
  return (
    <details
      className="results-ui-judging"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Judging setup</span>
        <ChevronDown size={20} aria-hidden="true" />
      </summary>
      {open && (
        <form
          className="results-ui-judgingForm"
          method="post"
          inert={!hydrated}
          data-judging-form="true"
          data-hydrated={hydrated}
          aria-busy={!hydrated || busy}
          onSubmit={(event) => {
            event.preventDefault();
            if (!hydrated || busy || frozen) return;
            const form = event.currentTarget,
              values = Object.fromEntries(
                new FormData(form).entries(),
              ) as Inputs;
            const result = judgingSettingsValues(policy, values);
            setErrors(result.errors || {});
            if (result.errors) {
              (
                form.elements.namedItem(
                  Object.keys(result.errors)[0],
                ) as HTMLElement | null
              )?.focus();
              return;
            }
            void execute(() =>
              run(
                "settings",
                {
                  settingsContract: SETTINGS_WRITE_CONTRACT,
                  policy: result.policy,
                  version: data.policyVersion,
                },
                { errorFeedback: "local" },
              ),
            );
          }}
        >
          <fieldset disabled={!hydrated || busy || frozen}>
            <section className="results-ui-formGroup">
              <h3>Judging rules</h3>
              <div className="results-ui-formGrid">
                {select(
                  "diversityAssessment",
                  "Collaboration assessment",
                  [["non-demographic-evidence", "Non-demographic evidence"]],
                  policy.diversityAssessment,
                )}
                {field("codexReviewer", "Codex reviewer")}
                {field("diversityRubric", "Collaboration rubric", "textarea", {
                  wide: true,
                })}
                {field("aiFallback", "AI fallback", "textarea")}
                {field("tieBreak", "Tie-break policy", "textarea")}
                {field("minJudges", "Minimum judges", "number", {
                  min: 1,
                  max: 1000,
                })}
              </div>
            </section>
            <section className="results-ui-formGroup">
              <h3>Votes and feedback</h3>
              <div className="results-ui-formGrid">
                {select(
                  "voteFormula",
                  "Vote formula",
                  [
                    ["sqrt-relative", "Square-root relative"],
                    ["fixed-target", "Fixed target"],
                  ],
                  policy.voteFormula,
                )}
                {select(
                  "projectEngagementRule",
                  "Public engagement",
                  [
                    ["display-only", "Display only"],
                    [
                      "score-with-approved-normalization",
                      "Count toward scores",
                    ],
                  ],
                  policy.projectEngagementRule,
                )}
                {field("voteTarget", "Vote target", "number", {
                  min: 1,
                  max: 160,
                })}
                {field("feedbackMax", "Feedback maximum length", "number", {
                  min: 30,
                  max: 500,
                })}
                {rule === "score-with-approved-normalization" && (
                  <>
                    {select(
                      "voters",
                      "Eligible voters",
                      audiences,
                      policy.engagementQualification?.voters,
                    )}
                    {select(
                      "feedbackAuthors",
                      "Eligible feedback authors",
                      audiences,
                      policy.engagementQualification?.feedbackAuthors,
                    )}
                    {select(
                      "feedbackReview",
                      "Feedback qualification",
                      [["staff-qualified", "Staff-qualified feedback"]],
                      policy.engagementQualification?.feedbackReview,
                    )}
                    {select(
                      "feedbackDuplicates",
                      "Duplicate feedback",
                      [
                        ["staff-reviewed", "Staff-reviewed"],
                        [
                          "exclude-exact-normalized-copies",
                          "Exclude exact normalized copies",
                        ],
                      ],
                      policy.engagementQualification?.feedbackDuplicates,
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="results-ui-formGroup">
              <h3>Published scoring information</h3>
              <div className="results-ui-formGrid">
                {field("criteria", "Scoring criteria", "textarea", {
                  value: policy.scoringDisclosure?.criteria,
                })}
                {field("weightage", "Weightage description", "textarea", {
                  value: policy.scoringDisclosure?.weightage,
                })}
              </div>
            </section>
            {policy.weights && (
              <section className="results-ui-formGroup">
                <h3>Saved weights</h3>
                <dl className="results-ui-weights">
                  {Object.entries(policy.weights).map(([key, value]) => (
                    <div key={key}>
                      <dt>
                        {(
                          {
                            human: "Human",
                            ai: "AI",
                            votes: "Votes",
                            diversity: "Collaboration",
                            codex: "Codex",
                            feedback: "Feedback bonus",
                          } as Inputs
                        )[key] || key}
                      </dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            <footer className="results-ui-formFooter">
              {error && (
                <p className="results-ui-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="button"
                disabled={!hydrated || busy || frozen}
              >
                <Save size={17} aria-hidden="true" />
                {busy ? "Saving…" : "Save judging setup"}
              </button>
            </footer>
          </fieldset>
          {frozen && (
            <p className="results-ui-reason">
              Final scores are frozen. Judging settings are read-only.
            </p>
          )}
        </form>
      )}
    </details>
  );
}
