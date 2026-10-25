"use client";
import DotAvatar from "./dot-avatar";
import { ProfileIcon } from "./profile-icons";
import { HeadingDot } from "./expressive-heading";
import { GenderSymbol, genderLabel } from "./gender-presentation";
import { dotColors, dotExpressions } from "../lib/avatar-contract";
import { useEffect, useRef, useState, type Ref } from "react";
import { Lock } from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";
import {
  profileDescriptionChoices,
  profilePhonePattern,
} from "../lib/profile-contract";
type Row = Record<string, any>;
type ProfileFieldErrors = Record<string, string>;
const platforms = ["LinkedIn", "GitHub", "X", "Instagram", "Website"];
const platformIcons: Record<string, string> = {
  LinkedIn: "linkedin",
  GitHub: "github",
  X: "x",
  Instagram: "instagram",
  Website: "website",
};
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
export function ProfileDescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      What best describes you?
      <select
        name="bestDescription"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose</option>
        {profileDescriptionChoices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
      {value && !profileDescriptionChoices.includes(value) && (
        <small className="muted">Saved: {value}</small>
      )}
    </label>
  );
}
type SocialLink = { type: string; url: string };
export function profileSocialRows(profile: Row): SocialLink[] {
  const rows: SocialLink[] = [];
  const seen = new Set<string>();
  const add = (type: string, url: string) => {
    url = url.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    rows.push({ type, url });
  };
  if (Array.isArray(profile.socialLinks)) {
    for (const link of profile.socialLinks) {
      if (link && platforms.includes(link.type) && typeof link.url === "string")
        add(link.type, link.url);
    }
  }
  if (Array.isArray(profile.socials)) {
    for (const url of profile.socials) {
      if (typeof url === "string") add(platform(url), url);
    }
  }
  return rows.length ? rows : [{ type: "LinkedIn", url: "" }];
}
export function profileSocialPayload(links: SocialLink[]) {
  return links
    .filter((link) => link.url.trim())
    .map((link) => ({ ...link, url: link.url.trim() }));
}
const expressionNames: Record<string, string> = {
  squeezed: "Squeezed",
  sleepy: "Sleepy",
  plus: "Plus",
  star: "Star",
  round: "Round",
  cheerful: "Cheerful",
  "mixed-plus": "Mixed plus",
  "mixed-slash": "Mixed slash",
};
const paletteOrder: (keyof typeof dotColors)[] = [
  "blue",
  "green",
  "purple",
  "orange",
  "charcoal",
  "grey",
  "coral",
  "yellow",
];
export function ProfileAvatarPicker({
  color,
  expression,
  onColor,
  onExpression,
}: {
  color: string;
  expression: string;
  onColor: (value: string) => void;
  onExpression: (value: string) => void;
}) {
  return (
    <section className="profile-avatar" aria-label="Your avatar">
      <fieldset className="profile-avatar-options">
        <legend className="sr-only">Expression</legend>
        <div className="profile-expression-grid">
          {Object.keys(dotExpressions).map((value) => (
            <label
              className="profile-avatar-choice"
              key={value}
              title={expressionNames[value]}
            >
              <input
                type="radio"
                name="avatarExpression"
                value={value}
                checked={expression === value}
                onChange={() => onExpression(value)}
              />
              <DotAvatar
                color={color}
                expression={value}
                size={40}
                decorative
              />
              <span className="sr-only">{expressionNames[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="profile-avatar-options">
        <legend className="sr-only">Color</legend>
        <div className="profile-color-grid">
          {paletteOrder.map((value) => (
            <label
              className="profile-avatar-choice"
              key={value}
              title={value.charAt(0).toUpperCase() + value.slice(1)}
            >
              <input
                type="radio"
                name="avatarColor"
                value={value}
                checked={color === value}
                onChange={() => onColor(value)}
              />
              <span
                className="profile-color-swatch"
                style={{ backgroundColor: dotColors[value] }}
                aria-hidden="true"
              />
              <span className="sr-only">
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
export function ProfileContactFields({
  phone,
  links,
  onPhone,
  onLinks,
  errors = {},
}: {
  phone: string;
  links: SocialLink[];
  onPhone: (value: string) => void;
  onLinks: (value: SocialLink[]) => void;
  errors?: ProfileFieldErrors;
}) {
  return (
    <div className="profile-contact-fields">
      <label>
        <span>
          Phone{" "}
          <span className="required-mark" aria-hidden="true">
            *
          </span>
        </span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          pattern={String.raw`\+[0-9 \(\)\-]{7,29}`}
          placeholder="+91 98765 43210"
          maxLength={30}
          value={phone}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "profile-phone-error" : undefined}
          onChange={(event) => onPhone(event.target.value)}
        />
        {errors.phone && (
          <small className="profile-field-error" id="profile-phone-error">
            {errors.phone}
          </small>
        )}
      </label>
      <fieldset className="profile-social-editor">
        <legend>Social profiles</legend>
        {links.map((link, index) => (
          <div className="profile-social-row" key={index}>
            <label className="profile-platform-select">
              <span className="sr-only">
                Platform for social link {index + 1}
              </span>
              <img
                className="profile-platform-icon"
                src={`/icons/social/${platformIcons[link.type] || "website"}.svg`}
                alt=""
                width={20}
                height={20}
              />
              <select
                title={link.type}
                value={link.type}
                onChange={(event) =>
                  onLinks(
                    links.map((row, i) =>
                      i === index ? { ...row, type: event.target.value } : row,
                    ),
                  )
                }
              >
                {platforms.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="profile-social-url">
              <span className="sr-only">
                {link.type} URL {index + 1}
              </span>
              <input
                type="url"
                pattern="https://.*"
                placeholder="https://"
                maxLength={2048}
                value={link.url}
                aria-invalid={errors[`social-${index}`] ? true : undefined}
                aria-describedby={
                  errors[`social-${index}`]
                    ? `profile-social-${index}-error`
                    : undefined
                }
                onChange={(event) =>
                  onLinks(
                    links.map((row, i) =>
                      i === index ? { ...row, url: event.target.value } : row,
                    ),
                  )
                }
              />
              {errors[`social-${index}`] && (
                <small
                  className="profile-field-error"
                  id={`profile-social-${index}-error`}
                >
                  {errors[`social-${index}`]}
                </small>
              )}
            </label>
            <button
              type="button"
              className="profile-remove-link"
              aria-label={`Remove ${link.type} link ${index + 1}`}
              title={`Remove ${link.type} link ${index + 1}`}
              onClick={() => onLinks(links.filter((_, i) => i !== index))}
            >
              <ProfileIcon name="trash" />
            </button>
          </div>
        ))}
        <button
          className="profile-add-link"
          type="button"
          disabled={links.length >= 8}
          onClick={() => onLinks([...links, { type: "Website", url: "" }])}
        >
          <ProfileIcon name="plus" />
          Add
        </button>
      </fieldset>
    </div>
  );
}
export function ProfileStepHeader({
  step,
  busy,
  color,
  expression,
  headingRef,
  onBack,
}: {
  step: number;
  busy: boolean;
  color: keyof typeof dotColors;
  expression: keyof typeof dotExpressions;
  headingRef?: Ref<HTMLHeadingElement>;
  onBack: () => void;
}) {
  return (
    <div className="profile-toolbar">
      <div
        className="profile-progress"
        role="progressbar"
        aria-label="Profile progress"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of 3`}
      >
        <span className="progress-track" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <i key={n} data-active={step === n} data-complete={step > n} />
          ))}
        </span>
        <span>{step} of 3</span>
      </div>
      <header className="profile-heading">
        {step > 1 ? (
          <button
            className="profile-back"
            type="button"
            aria-label="Previous profile step"
            disabled={busy}
            onClick={onBack}
          >
            <ProfileIcon name="back" />
          </button>
        ) : (
          <span className="profile-heading-spacer" aria-hidden="true" />
        )}
        <div className="profile-heading-title">
          <HeadingDot color={color} expression={expression} size={48} />
          <h1 ref={headingRef} tabIndex={-1}>
            Profile
          </h1>
        </div>
        <span className="profile-heading-spacer" aria-hidden="true" />
      </header>
    </div>
  );
}
export default function ProfileFlow({
  data,
  run,
}: {
  data: Row;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const p = data.profile || {};
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
    [links, setLinks] = useState(() => profileSocialRows(p)),
    [description, setDescription] = useState(p.best_description || ""),
    [organization, setOrganization] = useState(p.organization || ""),
    [orgId, setOrgId] = useState(p.openai_org_id || ""),
    [avatarColor, setAvatarColor] = useState(
      p.avatar_color in dotColors ? p.avatar_color : "blue",
    ),
    [avatarExpression, setAvatarExpression] = useState(
      p.avatar_expression in dotExpressions ? p.avatar_expression : "squeezed",
    ),
    [busy, setBusy] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const heading = useRef<HTMLHeadingElement>(null),
    first = useRef(true),
    saving = useRef(false);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      setHydrated(true);
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const clearFieldError = (field: string) => {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setError("");
  };
  return (
    <section
      className="profile-flow"
      data-step={step}
      data-hydrated={hydrated}
      aria-label="Your profile"
    >
      <ProfileStepHeader
        step={step}
        busy={busy}
        color={avatarColor as keyof typeof dotColors}
        expression={avatarExpression as keyof typeof dotExpressions}
        headingRef={heading}
        onBack={() => {
          setError("");
          setFieldErrors({});
          setStep(step - 1);
        }}
      />
      <form
        method="post"
        aria-busy={busy || !hydrated}
        noValidate
        key={step}
        className="profile-step"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const invalid: ProfileFieldErrors = {};
          if (step === 1) {
            if (name.trim().length < 2)
              invalid.fullName = "Enter at least 2 characters.";
            if (!bio.trim()) invalid.bio = "Add a one-line bio.";
            if (!sex) invalid.sex = "Choose an option.";
          }
          if (step === 2) {
            if (!profilePhonePattern.test(phone.trim().replace(/[ ()-]/g, "")))
              invalid.phone = "Include + and your country code.";
            links.forEach((link, index) => {
              if (!link.url.trim()) return;
              try {
                const url = new URL(link.url.trim());
                if (url.protocol !== "https:") throw new Error();
              } catch {
                invalid[`social-${index}`] = "Enter a complete https:// link.";
              }
            });
          }
          setFieldErrors(invalid);
          if (Object.keys(invalid).length) {
            const form = event.currentTarget;
            requestAnimationFrame(() => {
              const field = form.querySelector<HTMLElement>(
                '[aria-invalid="true"]',
              );
              field?.focus({ preventScroll: true });
              field?.scrollIntoView({
                behavior: "instant",
                block: "center",
                inline: "nearest",
              });
            });
            return;
          }
          if (step < 3) {
            setStep(step + 1);
            return;
          }
          if (saving.current) return;
          saving.current = true;
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
              socialLinks: profileSocialPayload(links),
              public: !!p.public,
              avatarColor,
              avatarExpression,
            });
            window.location.assign("/teams");
          } catch (error) {
            if (!(error instanceof ActionCancelled))
              setError((error as Error).message);
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset
          disabled={busy || !hydrated}
          className="profile-fields"
          tabIndex={0}
        >
          <legend className="sr-only">
            Step {step} of 3:{" "}
            {step === 1 ? "Basics" : step === 2 ? "Contact" : "About you"}
          </legend>
          {step === 1 ? (
            <div className="profile-basics-layout">
              <ProfileAvatarPicker
                color={avatarColor}
                expression={avatarExpression}
                onColor={setAvatarColor}
                onExpression={setAvatarExpression}
              />
              <div className="profile-basics-fields">
                <label>
                  <span>
                    Full name{" "}
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    name="fullName"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      clearFieldError("fullName");
                    }}
                    required
                    minLength={2}
                    maxLength={100}
                    aria-invalid={fieldErrors.fullName ? true : undefined}
                    aria-describedby={
                      fieldErrors.fullName ? "profile-name-error" : undefined
                    }
                  />
                  {fieldErrors.fullName && (
                    <small
                      className="profile-field-error"
                      id="profile-name-error"
                    >
                      {fieldErrors.fullName}
                    </small>
                  )}
                </label>
                <label className="profile-email-field">
                  Email
                  <input
                    type="email"
                    name="email"
                    value={data.me?.email || ""}
                    readOnly
                    autoComplete="email"
                  />
                  <Lock
                    className="profile-email-lock"
                    size={18}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    focusable="false"
                  />
                </label>
                <label>
                  <span>
                    Bio{" "}
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    name="bio"
                    value={bio}
                    maxLength={240}
                    required
                    aria-invalid={fieldErrors.bio ? true : undefined}
                    aria-describedby={
                      fieldErrors.bio ? "profile-bio-error" : undefined
                    }
                    onChange={(event) => {
                      setBio(event.target.value);
                      clearFieldError("bio");
                    }}
                  />
                  {fieldErrors.bio && (
                    <small
                      className="profile-field-error"
                      id="profile-bio-error"
                    >
                      {fieldErrors.bio}
                    </small>
                  )}
                </label>
                <fieldset
                  className="sex-choices"
                  aria-describedby={
                    fieldErrors.sex ? "profile-sex-error" : undefined
                  }
                >
                  <legend>
                    Sex{" "}
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                  </legend>
                  {["man", "woman", "non-binary"].map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="sex"
                        value={value}
                        required
                        checked={sex === value}
                        aria-invalid={fieldErrors.sex ? true : undefined}
                        aria-describedby={
                          fieldErrors.sex ? "profile-sex-error" : undefined
                        }
                        onChange={() => {
                          setSex(value);
                          clearFieldError("sex");
                        }}
                      />
                      <span style={{ gap: 4 }}><GenderSymbol value={value} size={14} />{genderLabel(value)}</span>
                    </label>
                  ))}
                </fieldset>
                {fieldErrors.sex && (
                  <small className="profile-field-error" id="profile-sex-error">
                    {fieldErrors.sex}
                  </small>
                )}
              </div>
            </div>
          ) : step === 2 ? (
            <ProfileContactFields
              phone={phone}
              links={links}
              onPhone={(value) => {
                setPhone(value);
                clearFieldError("phone");
              }}
              onLinks={(value) => {
                setLinks(value);
                setFieldErrors((previous): ProfileFieldErrors =>
                  previous.phone ? { phone: previous.phone } : {},
                );
                setError("");
              }}
              errors={fieldErrors}
            />
          ) : (
            <div className="profile-about-fields">
              <ProfileDescriptionField
                value={description}
                onChange={setDescription}
              />
              <label>
                Organization
                <input
                  autoComplete="organization"
                  value={organization}
                  maxLength={300}
                  onChange={(event) => setOrganization(event.target.value)}
                />
              </label>
              <label>
                OpenAI org ID
                <input
                  value={orgId}
                  maxLength={200}
                  onChange={(event) => setOrgId(event.target.value)}
                />
              </label>
              <a
                className="text-link"
                href="https://platform.openai.com/settings/organization/general"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ProfileIcon name="external" /> Find organization ID
              </a>
            </div>
          )}
        </fieldset>
        <div className="profile-actions">
          {Object.keys(fieldErrors).length > 0 && (
            <p className="sr-only" role="alert">
              Check the highlighted fields.
            </p>
          )}
          {error && (
            <p className="profile-save-error" role="alert">
              {error}
            </p>
          )}
          <button className="button profile-next" disabled={busy || !hydrated}>
            <span>{busy ? "Saving…" : step === 3 ? "Save" : "Next"}</span>
            <ProfileIcon name="next" />
          </button>
        </div>
      </form>
    </section>
  );
}
