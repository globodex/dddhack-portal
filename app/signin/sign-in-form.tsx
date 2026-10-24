"use client";
import { useEffect, useState, type FormEvent } from "react";
import styles from "./signin.module.css";

const messages: Record<string, string> = {
  AUTH_RATE_LIMITED: "Too many attempts. Please wait 15 minutes and try again.",
  GOOGLE_EMAIL_PROOF_REQUIRED:
    "Please use an email link to verify this email address.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_RETURN_PATH:
    "This return link is invalid. Open sign in from the portal again.",
  google_cancelled:
    "Google sign-in was cancelled. You can try again or use an email link.",
  MAGIC_LINK_INVALID:
    "This link has expired or belongs to another browser. Request a new link here.",
};
const unavailable =
  "Sign-in is temporarily unavailable. Please try again later.";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [returnTo, setReturnTo] = useState("/dashboard");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setReturnTo(
      query.get("returnTo") || query.get("return_to") || "/dashboard",
    );
    if (query.has("error")) {
      setMessage(
        messages[query.get("error") || ""] ||
          "Sign-in could not be completed. Please try again.",
      );
      setError(true);
    }
  }, []);

  async function signIn(kind: "email" | "google") {
    setBusy(kind);
    setMessage("");
    setError(false);
    try {
      const response = await fetch(
        kind === "email" ? "/api/auth/magic/request" : "/api/auth/google/start",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            kind === "email" ? { email, returnTo } : { returnTo },
          ),
        },
      );
      const result: { error?: string; message?: string; redirectTo?: string } =
        await response.json();
      if (!response.ok)
        throw new Error(messages[result.error || ""] || unavailable);
      if (kind === "google" && result.redirectTo) {
        const destination = new URL(result.redirectTo);
        if (
          destination.origin !== "https://accounts.google.com" ||
          destination.pathname !== "/o/oauth2/v2/auth"
        )
          throw new Error(unavailable);
        window.location.assign(destination.toString());
        return;
      }
      setMessage(
        result.message ||
          "Check your email for a sign-in link. Open it in this browser within 15 minutes.",
      );
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : unavailable);
    } finally {
      setBusy(null);
    }
  }
  function requestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void signIn("email");
  }
  return (
    <main className={styles.page}>
      <a className={styles.back} href="/">
        ← Back to the event
      </a>
      <section className={styles.card} aria-labelledby="signin-heading">
        <img
          className={styles.mark}
          src="/brand/codex-user-supplied.svg"
          alt=""
          width="48"
          height="48"
        />
        <p className={styles.eyebrow}>DevDay Exchange · New Delhi</p>
        <h1 id="signin-heading">Welcome back.</h1>
        <p className={styles.description}>
          Sign in with the email you used to register for the hackathon.
        </p>
        <button
          className={styles.google}
          type="button"
          disabled={busy !== null}
          onClick={() => void signIn("google")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.06.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.59A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.39 13.91A6 6 0 0 1 6.07 12c0-.66.11-1.3.32-1.91V7.5H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.5l3.34-2.59Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.96c1.47 0 2.79.51 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"
            />
          </svg>
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
        <div className={styles.divider}>
          <span>or use your email</span>
        </div>
        <form onSubmit={requestEmail}>
          <label className={styles.label} htmlFor="signin-email">
            Email address
          </label>
          <input
            id="signin-email"
            className={styles.input}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy !== null}
            aria-describedby="signin-help"
          />
          <button
            className={styles.submit}
            type="submit"
            disabled={busy !== null}
          >
            {busy === "email"
              ? "Sending your link…"
              : "Email me a sign-in link"}
          </button>
        </form>
        <p id="signin-help" className={styles.help}>
          No password needed. Open your email link in this browser.
        </p>
        {message && (
          <p
            className={error ? styles.error : styles.notice}
            role={error ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </section>
      <p className={styles.footer}>Build something worth sharing.</p>
    </main>
  );
}
