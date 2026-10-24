"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  Ticket,
} from "lucide-react";
import CreditInstructions from "./credit-instructions";
import { HeadingDot } from "./expressive-heading";
import { portalErrorText } from "../lib/ui-feedback";
import { InformationHeader } from "./information-navigation";

type CreditRecord = Record<string, any>;

export function Credit({ credit }: { credit: CreditRecord }) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const pending = useRef(false),
    active = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    active.current = true;
    const hide = () => {
      ++generation.current;
      setValue("");
      setCopied(false);
    };
    const visibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active.current = false;
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const allocated = !!credit.allocated;
  return (
    <article className="credit-row dashboard-credit personal-credit-card">
      <header className="personal-credit-card-heading">
        <h3>{credit.name}</h3>
        <span
          className={`personal-credit-status${allocated ? " is-assigned" : ""}`}
        >
          {allocated
            ? "Assigned"
            : credit.exhausted === true
              ? "Out of stock"
              : "Waiting for a code"}
        </span>
      </header>
      <CreditInstructions markdown={credit.instructions || ""} />
      {allocated && (
        <div className="credit-secret">
          <code
            aria-label={value ? "Your private allocation" : "Allocation hidden"}
          >
            {value || "••••••••••••••••"}
          </code>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            aria-label={value ? "Hide allocation" : "Reveal my allocation"}
            aria-pressed={!!value}
            aria-busy={busy}
            onClick={async () => {
              if (value) {
                setValue("");
                setCopied(false);
                return;
              }
              if (pending.current) return;
              pending.current = true;
              const epoch = ++generation.current;
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/portal", {
                  method: "POST",
                  credentials: "same-origin",
                  cache: "no-store",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    action: "reveal-credit",
                    data: { typeId: credit.type_id },
                  }),
                });
                const result = (await response.json()) as {
                  value?: string;
                  code?: string;
                  message?: string;
                };
                if (!response.ok) throw new Error(portalErrorText(result));
                if (typeof result.value !== "string" || !result.value)
                  throw new Error("Your allocation could not be revealed.");
                if (
                  active.current &&
                  epoch === generation.current &&
                  !document.hidden
                )
                  setValue(result.value);
              } catch (cause) {
                if (active.current) setError((cause as Error).message);
              } finally {
                pending.current = false;
                if (active.current) setBusy(false);
              }
            }}
          >
            {busy ? (
              <LoaderCircle
                size={20}
                className="credit-batch-spinner"
                aria-hidden="true"
              />
            ) : value ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
            <span className="sr-only">
              {busy ? "Revealing…" : value ? "Hide" : "Reveal"}
            </span>
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={!value || busy}
            aria-label={copied ? "Copied allocation" : "Copy allocation"}
            title={copied ? "Copied" : "Copy allocation"}
            data-copied={copied}
            onClick={async () => {
              setError("");
              try {
                await navigator.clipboard.writeText(value);
                setCopied(true);
              } catch {
                setError("Copy failed. Select and copy the revealed value.");
              }
            }}
          >
            {copied ? (
              <CircleCheck size={20} aria-hidden="true" />
            ) : (
              <Copy size={20} aria-hidden="true" />
            )}
            <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Allocation copied." : ""}
      </span>
      {error && (
        <p className="personal-credit-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export function PersonalCreditsContent({
  credits = [],
  checkedIn,
}: {
  credits?: CreditRecord[];
  checkedIn: boolean;
}) {
  if (!checkedIn)
    return (
      <section className="personal-credit-empty">
        <Ticket size={28} aria-hidden="true" />
        <h3>Credits unlock at check-in.</h3>
      </section>
    );
  if (!credits.length)
    return (
      <section className="personal-credit-empty">
        <Ticket size={28} aria-hidden="true" />
        <h3>No credits available yet.</h3>
      </section>
    );
  return (
    <div className="personal-credit-list">
      {credits.map((credit) => (
        <Credit key={credit.type_id} credit={credit} />
      ))}
    </div>
  );
}

export default function PersonalCredits({ data }: { data: CreditRecord }) {
  return (
    <div className="personal-credits-page">
      <header className="page-heading personal-credits-heading">
        <h1>
          <HeadingDot color="green" expression="cheerful" />
          Your credits
        </h1>
        <a href="/dashboard#credits" className="personal-credit-dashboard-link">
          <ArrowLeft size={18} aria-hidden="true" />
          Dashboard
        </a>
      </header>
      <PersonalCreditsContent
        checkedIn={data.checkedIn === true}
        credits={data.credits || []}
      />
    </div>
  );
}

export function PersonalCreditsAccess({
  checkInRequired = false,
  title,
}: {
  checkInRequired?: boolean;
  title?: string;
}) {
  return (
    <>
      <InformationHeader path="/personal/credits" />
      <main className="personal-credit-access">
        <section>
          <Ticket size={30} aria-hidden="true" />
          <h1>
            {checkInRequired
              ? "Credits unlock at check-in."
              : title || "Your credits could not load."}
          </h1>
          <a className="button secondary" href="/dashboard#credits">
            <ArrowLeft size={18} aria-hidden="true" />
            Back to Dashboard
          </a>
        </section>
      </main>
    </>
  );
}
