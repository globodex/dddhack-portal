"use client";
import { useHydrated } from "./use-hydrated";
import { useId, useRef, useState } from "react";
import { ShieldCheck, ShieldMinus } from "lucide-react";
import type { AdminRun } from "./admin-participant-actions";
import type { AdminAccessView } from "../lib/admin-access";

export function addAdminValues(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))
    throw new Error("Enter one valid email address.");
  return { email, confirmation: "ADD_ADMIN" };
}
export function revokeAdminValues(userId: string) {
  if (!userId) throw new Error("Choose an admin.");
  return { userId, confirmation: "REVOKE_ADMIN" };
}
export default function AddAdmins({
  owner,
  run,
  title = "Admin access",
  access,
}: {
  owner: boolean;
  run: AdminRun;
  title?: string;
  access?: AdminAccessView;
}) {
  const hydrated = useHydrated(),
    id = useId(),
    pending = useRef(false),
    emailInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  if (!owner) return null;
  const perform = async (target: string, operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setBusy(target);
    setError("");
    try {
      await operation();
    } catch {
      // Portal.run owns the complete persistent error notice; keep form state for retry.
    } finally {
      pending.current = false;
      setBusy(null);
      // Pending disables the native opener before the shared dialog can retain it.
      // Restore after React enables controls and the dialog's history cleanup settles.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (document.querySelector("dialog[open]")) return;
          const target =
            opener?.isConnected && !opener.matches(":disabled")
              ? opener
              : emailInput.current;
          target?.focus({ preventScroll: true });
        }),
      );
    }
  };
  return (
    <section
      className="admin-control admin-add-admins"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      {access && (
        <ul className="admin-access-list" aria-label="Current admin access">
          {access.items.map((person) => (
            <li key={person.id}>
              <div className="admin-access-person">
                <strong>{person.name}</strong>
                <span>{person.email}</span>
              </div>
              {person.owner ? (
                <span className="admin-access-owner">
                  <ShieldCheck size={16} aria-hidden="true" />
                  Owner
                </span>
              ) : (
                <button
                  type="button"
                  className="button secondary admin-access-revoke"
                  disabled={!hydrated || !!busy}
                  aria-label={`Revoke admin access for ${person.name}`}
                  aria-busy={busy === person.id}
                  onClick={() =>
                    void perform(person.id, () =>
                      run("revoke-admin", revokeAdminValues(person.id)),
                    )
                  }
                >
                  <ShieldMinus size={16} aria-hidden="true" />
                  {busy === person.id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        method="post"
        inert={!hydrated}
        data-hydrated={hydrated}
        onSubmit={(event) => {
          event.preventDefault();
          let values;
          try {
            values = addAdminValues(email);
          } catch (cause) {
            setError((cause as Error).message);
            return;
          }
          void perform("add", async () => {
            await run("add-admin", values);
            setEmail("");
          });
        }}
      >
        <fieldset disabled={!hydrated || !!busy} className="admin-email-action">
          <label>
            <span>
              Email{" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={emailInput}
              aria-label="Admin email"
              type="email"
              required
              autoComplete="off"
              value={email}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              placeholder="name@example.com"
            />
          </label>
          <button
            className="button"
            type="submit"
            disabled={!hydrated || !!busy || !email.trim()}
            aria-busy={busy === "add"}
          >
            {busy === "add" ? "Adding…" : "Add"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p id={`${id}-error`} role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
