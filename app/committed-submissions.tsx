"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Version = {
  id: string;
  attempt: number;
  created_at: string;
  payload: Record<string, any>;
};
type VersionMetadata = Omit<Version, "payload">;
const timestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
        timeZoneName: "short",
      }).format(date);
};

export function CommittedSubmission({
  item,
  currentVersionId,
  payload,
  children,
  onOpen,
}: {
  item: VersionMetadata;
  currentVersionId?: string;
  payload?: Record<string, any>;
  children: ReactNode;
  onOpen?: () => void;
}) {
  return (
    <details
      className="committed-submission"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen?.();
      }}
    >
      <summary>
        <span className="committed-submission-label">
          Submission {item.attempt}
          {item.id === currentVersionId && (
            <span className="committed-submission-current">Current</span>
          )}
        </span>
        <time dateTime={item.created_at}>{timestamp(item.created_at)}</time>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="committed-submission-content">
        {payload?.banner && (
          <img
            className="committed-submission-banner"
            src={payload.banner}
            alt={`Submission ${item.attempt} project banner`}
          />
        )}
        <div className="committed-submission-details">{children}</div>
      </div>
    </details>
  );
}

export default function CommittedSubmissions({
  canRead,
  currentVersionId,
  attempts,
  renderVersion,
}: {
  canRead: boolean;
  currentVersionId?: string;
  attempts: VersionMetadata[];
  renderVersion: (payload: Record<string, any>) => ReactNode;
}) {
  const [items, setItems] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!canRead || !requested) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setItems([]);
    void (async () => {
      try {
        const response = await fetch("/api/portal?view=%2Fproject-history", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const body = (await response.json()) as { message?: string; items?: unknown };
        const versions = body.items;
        if (!response.ok)
          throw new Error(body.message || "Submission history could not load.");
        if (
          !Array.isArray(versions) ||
          versions.length > 3 ||
          versions.some(
            (item: Version) =>
              !item.id ||
              !Number.isInteger(item.attempt) ||
              item.attempt < 1 ||
              item.attempt > 3 ||
              !item.payload ||
              typeof item.payload !== "object",
          )
        )
          throw new Error("Submission history is unavailable. Try again.");
        if (
          attempts.some(
            (item) =>
              !versions.some(
                (saved: Version) =>
                  saved.id === item.id && saved.attempt === item.attempt,
              ),
          )
        )
          throw new Error(
            "Submission history changed. Refresh to load the current list.",
          );
        if (!controller.signal.aborted) {
          setItems(versions);
          setLoaded(true);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, [canRead, requested, retry]);
  if (!canRead) return null;
  return (
    <section
      className="committed-submissions"
      aria-label="Committed submissions"
      aria-busy={busy}
    >
      <h3>Submissions</h3>
      {!attempts.length && (
        <p className="committed-submissions-status">
          No committed submissions yet.
        </p>
      )}
      {attempts.map((item) => {
        const payload = items.find(
          (version) => version.id === item.id,
        )?.payload;
        return (
          <CommittedSubmission
            key={item.id}
            item={item}
            payload={payload}
            currentVersionId={currentVersionId}
            onOpen={() => {
              if (!loaded) setRequested(true);
            }}
          >
            {payload ? (
              renderVersion(payload)
            ) : error ? (
              <div className="committed-submissions-error">
                <p role="alert">{error}</p>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry history
                </button>
              </div>
            ) : (
              <div className="committed-submission-loading" role="status">
                <span className="sr-only">Loading saved submission…</span>
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <i aria-hidden="true" />
              </div>
            )}
          </CommittedSubmission>
        );
      })}
    </section>
  );
}
