"use client";
import { useHydrated } from "./use-hydrated";
import { useId, useState } from "react";
import { useAdminOperation, type AdminRun } from "./admin-participant-actions";

export function addAdminValues(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))
    throw new Error("Enter one valid email address.");
  return { email, confirmation: "ADD_ADMIN" };
}

export default function AddAdmins({
  owner,
  run,
  title = "Add Admins",
}: {
  owner: boolean;
  run: AdminRun;
  title?: string;
}) {
  const hydrated = useHydrated();
  const id = useId();
  const [email, setEmail] = useState("");
  const { busy, error, execute } = useAdminOperation();
  if (!owner) return null;
  return (
    <section
      className="admin-control admin-add-admins"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <form
        method="post"
        inert={!hydrated}
        data-hydrated={hydrated}
        onSubmit={(event) => {
          event.preventDefault();
          void execute(async () => {
            await run("add-admin", addAdminValues(email));
            setEmail("");
          });
        }}
      >
        <fieldset
          disabled={!hydrated || busy}
          className="admin-email-action"
        >
          <label>
            <span>
              Email{" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <input
              aria-label="Admin email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <button
            className="button"
            type="submit"
            disabled={!hydrated || busy || !email.trim()}
          >
            {busy ? "Waiting…" : "Add"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
