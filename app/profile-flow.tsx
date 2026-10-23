"use client";
import { useEffect, useRef, useState } from "react";
type Row = Record<string, any>;
const platforms = ["X", "LinkedIn", "Instagram", "Website"];
const platform = (s: string) => {
  try {
    const h = new URL(s).hostname.replace(/^www\./, "");
    return h === "x.com" || h === "twitter.com"
      ? "X"
      : h === "linkedin.com"
        ? "LinkedIn"
        : h === "instagram.com"
          ? "Instagram"
          : "Website";
  } catch {
    return "Website";
  }
};
export default function ProfileFlow({
  data,
  run,
}: {
  data: Row;
  run: (a: string, d: Row) => Promise<Row>;
}) {
  const p = data.profile || {};
  const [photo, setPhoto] = useState<string | undefined>(),
    [photoPreview, setPhotoPreview] = useState<string | undefined>(p.photoUrl);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 4 * 1024 * 1024
    ) {
      setError("Use a PNG or JPEG up to 4 MB.");
      return;
    }
    try {
      const image = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Image processing unavailable.");
        const size = Math.min(image.width, image.height);
        ctx.drawImage(
          image,
          (image.width - size) / 2,
          (image.height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256,
        );
        const value = canvas.toDataURL("image/png");
        if (value.length > 180000)
          throw new Error("Photo is too detailed; choose a smaller image.");
        setPhoto(value);
        setPhotoPreview(value);
        setError("");
      } finally {
        image.close();
      }
    } catch {
      setError(
        "That image could not be processed. Try a different PNG or JPEG.",
      );
    }
  };
  const [step, setStep] = useState(1),
    [name, setName] = useState(p.display_name || data.me?.name || ""),
    [sex, setSex] = useState(
      p.gender_confirmed && ["man", "woman", "non-binary"].includes(p.gender)
        ? p.gender
        : "",
    ),
    [bio, setBio] = useState(p.bio || ""),
    [links, setLinks] = useState<{ type: string; url: string }[]>(
      (p.socials || []).map((url: string) => ({ type: platform(url), url })),
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
  const update = (i: number, key: "type" | "url", value: string) =>
    setLinks(links.map((x, j) => (i === j ? { ...x, [key]: value } : x)));
  return (
    <section className="profile-flow" aria-label="Your profile">
      <div className="profile-progress" aria-label={`Step ${step} of 2`}>
        <span className="progress-track">
          <i />
          <i data-active={step === 2} />
        </span>
        {step} / 2
      </div>
      {step === 2 && (
        <button
          className="profile-back"
          type="button"
          aria-label="Back to name and sex"
          disabled={busy}
          onClick={() => {
            setError("");
            setStep(1);
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
          {step === 1 ? "> <" : "○ ○"}
        </span>
      </header>
      <form
        key={step}
        className="profile-step"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (step === 1) {
            if (!sex || name.trim().length < 2) return;
            setStep(2);
            return;
          }
          if (busy) return;
          setBusy(true);
          try {
            await run("complete-profile", {
              displayName: name.trim(),
              gender: sex,
              bio: bio.trim(),
              socialLinks: links
                .filter((l) => l.url.trim())
                .map((l) => ({ ...l, url: l.url.trim() })),
              public: !!p.public,
              ...(photo ? { photo } : {}),
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
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
          </>
        ) : (
          <>
            <label className="profile-photo-upload">
              <span className="profile-photo-preview">
                {photoPreview ? (
                  <img src={photoPreview} alt="Your profile photo" />
                ) : (
                  <span aria-hidden="true">
                    {name
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((s: string) => s[0])
                      .join("") || "?"}
                  </span>
                )}
              </span>
              Photo · optional
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                }}
                disabled={busy}
              />
            </label>
            <label>
              One-line bio
              <input
                name="bio"
                value={bio}
                maxLength={240}
                required
                onChange={(e) => setBio(e.target.value)}
              />
            </label>
            <fieldset className="social-editor">
              <legend>Social links</legend>
              {links.map((l, i) => (
                <div className="social-row" key={i}>
                  <label className="sr-only" htmlFor={`social-type-${i}`}>
                    Link {i + 1} platform
                  </label>
                  <select
                    id={`social-type-${i}`}
                    value={l.type}
                    onChange={(e) => update(i, "type", e.target.value)}
                  >
                    {platforms.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor={`social-url-${i}`}>
                    Link {i + 1} HTTPS URL
                  </label>
                  <input
                    id={`social-url-${i}`}
                    type="url"
                    pattern="https://.*"
                    placeholder="https://"
                    value={l.url}
                    maxLength={2048}
                    onChange={(e) => update(i, "url", e.target.value)}
                  />
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={links.length >= 8 || busy}
                onClick={() => setLinks([...links, { type: "X", url: "" }])}
              >
                + Add social link
              </button>
            </fieldset>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="button profile-next" disabled={busy}>
          {busy ? "Saving…" : step === 1 ? "Next →" : "Done ✓"}
        </button>
      </form>
    </section>
  );
}
