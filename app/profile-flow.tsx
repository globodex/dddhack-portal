"use client";
import DotAvatar from "./dot-avatar";
import { dotColors, dotExpressions } from "../lib/avatar-contract";
import { useEffect, useRef, useState } from "react";
import { ActionCancelled } from "../lib/action-confirmation";
import { profilePhonePattern } from "../lib/profile-contract";
type Row = Record<string, any>;
const platforms = ["LinkedIn", "GitHub", "X", "Instagram", "Website"];
function platform(url: string) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h === "linkedin.com"
      ? "LinkedIn"
      : h === "github.com"
        ? "GitHub"
        : h === "x.com" || h === "twitter.com"
          ? "X"
          : h === "instagram.com"
            ? "Instagram"
            : "Website";
  } catch {
    return "Website";
  }
}
export function profileInitialLinks(profile: Row) {
  const typed = Array.isArray(profile.socialLinks)
    ? profile.socialLinks.filter(
        (link: Row) =>
          platforms.includes(link.type) && typeof link.url === "string",
      )
    : [];
  const all = [
    ...new Set<string>([
      ...(Array.isArray(profile.socials)
        ? profile.socials.filter((url: unknown) => typeof url === "string")
        : []),
      ...typed.map((link: Row) => link.url),
    ]),
  ];
  const initialLinks = Object.fromEntries(
    platforms.map((type) => [
      type,
      typed.find((link: Row) => link.type === type)?.url ||
        all.find((url) => platform(url) === type) ||
        "",
    ]),
  );
  return {
    initialLinks,
    extras: all.filter((url) => !Object.values(initialLinks).includes(url)),
  };
}
export default function ProfileFlow({
  data,
  run,
}: {
  data: Row;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const p = data.profile || {};
  const { initialLinks, extras } = profileInitialLinks(p);
  const [step, setStep] = useState(1),
    [name, setName] = useState(p.display_name || data.me?.name || ""),
    [sex, setSex] = useState(
      (p.gender_confirmed || p.gender_prefilled) &&
        ["man", "woman", "non-binary"].includes(p.gender)
        ? p.gender
        : "",
    ),
    [bio, setBio] = useState(p.bio || ""),
    [phone, setPhone] = useState(p.phone || ""),
    [links, setLinks] = useState(initialLinks),
    [description, setDescription] = useState(p.best_description || ""),
    [organization, setOrganization] = useState(p.organization || ""),
    [orgId, setOrgId] = useState(p.openai_org_id || ""),
    [avatarColor, setAvatarColor] = useState(p.avatar_color || "blue"),
    [avatarExpression, setAvatarExpression] = useState(
      p.avatar_expression || "squeezed",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null),
    first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);
  const choices = [
    ...new Set([
      ...(p.descriptionChoices || []),
      ...(p.best_description ? [p.best_description] : []),
    ]),
  ] as string[];
  return (
    <section className="profile-flow" aria-label="Your profile">
      <div className="profile-progress" aria-label={`Step ${step} of 3`}>
        <span className="progress-track">
          {[1, 2, 3].map((n) => (
            <i key={n} data-active={step >= n} />
          ))}
        </span>
        {step} / 3
      </div>
      {step > 1 && (
        <button
          className="profile-back"
          type="button"
          aria-label="Previous profile step"
          disabled={busy}
          onClick={() => {
            setError("");
            setStep(step - 1);
          }}
        >
          ←
        </button>
      )}
      <header>
        <h1 ref={heading} tabIndex={-1}>
          Your
          <br />
          profile
        </h1>
        <span
          className={`profile-character ${step === 2 ? "purple" : "blue"}`}
          aria-hidden="true"
        >
          {step === 1 ? "> <" : step === 2 ? "○ ○" : "+ +"}
        </span>
      </header>
      <form
        aria-busy={busy}
        key={step}
        className="profile-step"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (step < 3) {
            if (step === 1 && (name.trim().length < 2 || !bio.trim() || !sex)) {
              setError("Complete your name, bio and sex.");
              return;
            }
            if (
              step === 2 &&
              !profilePhonePattern.test(phone.trim().replace(/[ ()-]/g, ""))
            ) {
              setError(
                "Enter your international phone number, including + and country code.",
              );
              return;
            }
            setStep(step + 1);
            return;
          }
          if (busy) return;
          setBusy(true);
          try {
            await run("complete-profile", {
              displayName: name.trim(),
              gender: sex,
              bio: bio.trim(),
              phone: phone.trim(),
              bestDescription: description,
              organization: organization.trim(),
              openaiOrgId: orgId.trim(),
              socialLinks: [
                ...platforms
                  .filter((t) => links[t].trim())
                  .map((type) => ({ type, url: links[type].trim() })),
                ...extras.map((url: string) => ({ type: "Website", url })),
              ],
              public: !!p.public,
              avatarColor,
              avatarExpression,
            });
            window.location.assign("/teams");
          } catch (e) {
            if (!(e instanceof ActionCancelled)) setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="profile-fields">
          <legend className="sr-only">Step {step} of 3</legend>
          {step === 1 ? (
            <>
              <label>
                Full name
                <input
                  name="fullName"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={data.me?.email || ""}
                  readOnly
                  autoComplete="email"
                />
              </label>
              <label>
                One-line bio{" "}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
                <input
                  name="bio"
                  value={bio}
                  maxLength={240}
                  required
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>
              <fieldset className="sex-choices">
                <legend>Sex</legend>
                {[
                  ["man", "Male"],
                  ["woman", "Female"],
                  ["non-binary", "Non-binary"],
                ].map(([v, label]) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="sex"
                      value={v}
                      required
                      checked={sex === v}
                      onChange={() => setSex(v)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Your avatar</legend>
                <DotAvatar color={avatarColor} expression={avatarExpression} />
                <div className="palette-picker">
                  {Object.entries(dotColors).map(([color, hex]) => (
                    <label key={color}>
                      <input
                        type="radio"
                        name="avatarColor"
                        value={color}
                        checked={avatarColor === color}
                        onChange={() => setAvatarColor(color)}
                      />
                      <span
                        className="palette-swatch"
                        style={{ background: hex }}
                      />
                      {color}
                    </label>
                  ))}
                </div>
                <div className="avatar-picker">
                  {Object.keys(dotExpressions).map((expression) => (
                    <label key={expression}>
                      <input
                        type="radio"
                        name="avatarExpression"
                        value={expression}
                        checked={avatarExpression === expression}
                        onChange={() => setAvatarExpression(expression)}
                      />
                      <DotAvatar
                        color={avatarColor}
                        expression={expression}
                        size={48}
                      />
                      <span>
                        {
                          dotExpressions[
                            expression as keyof typeof dotExpressions
                          ]
                        }
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : step === 2 ? (
            <>
              <label>
                Phone{" "}
                <span className="required-mark" aria-hidden="true">
                  *
                </span>
                <input
                  aria-describedby="phone-team-policy"
                  type="tel"
                  autoComplete="tel"
                  required
                  pattern={String.raw`\+[0-9 \(\)\-]{7,29}`}
                  placeholder="+91 98765 43210"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <small id="phone-team-policy">
                  Shared only with your team.
                </small>
              </label>
              {platforms.map((type) => (
                <label key={type}>
                  {type} <span className="muted">Optional</span>
                  <input
                    type="url"
                    pattern="https://.*"
                    placeholder="https://"
                    maxLength={2048}
                    value={links[type]}
                    onChange={(e) =>
                      setLinks({ ...links, [type]: e.target.value })
                    }
                  />
                </label>
              ))}
            </>
          ) : (
            <>
              <label>
                What best describes you
                <select
                  value={description}
                  disabled={!choices.length}
                  onChange={(e) => setDescription(e.target.value)}
                >
                  <option value="">
                    {choices.length ? "Choose" : "Awaiting host choices"}
                  </option>
                  {choices.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Organization
                <input
                  autoComplete="organization"
                  value={organization}
                  maxLength={300}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              </label>
              <label>
                OpenAI organization ID
                <input
                  value={orgId}
                  maxLength={200}
                  onChange={(e) => setOrgId(e.target.value)}
                />
              </label>
              <a
                className="text-link"
                href="https://platform.openai.com/settings/organization/general"
                target="_blank"
                rel="noopener noreferrer"
              >
                Find ID ↗
              </a>
            </>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button className="button profile-next" disabled={busy}>
          {busy ? "Saving…" : step === 3 ? "Save" : "Next →"}
        </button>
      </form>
    </section>
  );
}
