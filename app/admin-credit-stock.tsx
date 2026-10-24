"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  Search,
} from "lucide-react";
import { portalErrorText } from "../lib/ui-feedback";
import { ist } from "../lib/time";

export type StockSummary = {
  total: number;
  assigned: number;
  available: number;
  waiting: number;
  exhausted: boolean;
};
export type StockEntry = {
  id: string;
  person: string | null;
  email: string | null;
  maskedCode: string;
  assignedAt: string | null;
  status: "Assigned" | "Available";
};
type StockPage = {
  items: StockEntry[];
  page: number;
  pageSize: number;
  totalRows: number;
  hasMore: boolean;
  summary: StockSummary;
};

export default function AdminCreditStock({
  typeId,
  heading,
  onSummary,
}: {
  typeId: string;
  heading: string;
  onSummary: (summary: StockSummary) => void;
}) {
  const [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [attempt, setAttempt] = useState(0),
    [data, setData] = useState<StockPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revealed, setRevealed] = useState<Record<string, string>>({}),
    [rowBusy, setRowBusy] = useState(""),
    [rowError, setRowError] = useState<Record<string, string>>({}),
    [copied, setCopied] = useState("");
  const active = useRef(true),
    generation = useRef(0),
    secretGeneration = useRef(0),
    requestKey = useRef(""),
    summary = useRef(onSummary),
    revealPending = useRef(false),
    listId = useId();
  summary.current = onSummary;
  useEffect(() => {
    active.current = true;
    const hide = () => {
      ++secretGeneration.current;
      setRevealed({});
      setCopied("");
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
  useEffect(() => {
    const key = JSON.stringify([typeId, status, query, page, attempt]);
    if (requestKey.current === key) return;
    requestKey.current = key;
    const epoch = ++generation.current;
    ++secretGeneration.current;
    setLoading(true);
    setError("");
    setRevealed({});
    setCopied("");
    setRowError({});
    const params = new URLSearchParams({
      view: `/admin/credit-stock/${encodeURIComponent(typeId)}${status ? `/${status}` : ""}`,
      q: query,
      page: String(page),
    });
    void (async () => {
      try {
        const response = await fetch(`/api/portal?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const body = (await response.json()) as StockPage & {
          code?: string;
          message?: string;
        };
        if (!response.ok) throw new Error(portalErrorText(body));
        if (
          !Array.isArray(body.items) ||
          body.items.length > 25 ||
          !body.summary
        )
          throw new Error("Stock could not be loaded.");
        if (active.current && epoch === generation.current) {
          setData(body);
          summary.current(body.summary);
        }
      } catch (cause) {
        if (active.current && epoch === generation.current)
          setError((cause as Error).message);
      } finally {
        if (active.current && epoch === generation.current) setLoading(false);
      }
    })();
  }, [typeId, status, query, page, attempt]);

  return (
    <section
      className="credit-stock-detail"
      aria-label={`${heading} stock`}
      aria-busy={loading}
    >
      <div className="credit-stock-filters">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(0);
            setQuery(search.trim());
          }}
        >
          <label className="sr-only" htmlFor={`${listId}-search`}>
            Search stock by person or email
          </label>
          <input
            id={`${listId}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search person or email"
          />
          <button
            className="button secondary"
            type="submit"
            disabled={loading}
            aria-label="Search stock"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </form>
        <label>
          <span className="sr-only">Allocation status</span>
          <select
            aria-label="Allocation status"
            value={status}
            disabled={loading}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All codes</option>
            <option value="assigned">Assigned</option>
            <option value="available">Available</option>
          </select>
        </label>
      </div>
      {error ? (
        <div className="credit-stock-load-error">
          <p role="alert">{error}</p>
          <button
            className="button secondary"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <div
          className="credit-stock-table-frame"
          tabIndex={0}
          role="region"
          aria-label={`${heading} allocation table`}
        >
          <table className="credit-stock-table" role="table">
            <thead>
              <tr role="row">
                <th role="columnheader">Person</th>
                <th role="columnheader">Code</th>
                <th role="columnheader">Assigned at</th>
                <th role="columnheader">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr
                      className="credit-stock-loading-row"
                      key={index}
                      aria-hidden="true"
                    >
                      <td colSpan={4}>
                        <span />
                        <span />
                      </td>
                    </tr>
                  ))
                : (data?.items || []).map((entry, index) => {
                    const value = revealed[entry.id],
                      busy = rowBusy === entry.id,
                      recipient = entry.person
                        ? `for ${entry.person}${entry.email ? `, ${entry.email}` : ""}`
                        : `in available stock ${page * 25 + index + 1}`;
                    return (
                      <tr key={entry.id} role="row">
                        <td role="cell" data-label="Person">
                          <strong>{entry.person || "Unassigned"}</strong>
                          {entry.email && (
                            <span className="credit-stock-email">
                              {entry.email}
                            </span>
                          )}
                        </td>
                        <td role="cell" data-label="Code">
                          <div className="credit-stock-code">
                            <code
                              aria-label={
                                value
                                  ? `Revealed code for ${entry.person || "available stock"}`
                                  : "Code hidden"
                              }
                            >
                              {value || entry.maskedCode || "[masked]"}
                            </code>
                            <div className="credit-stock-code-actions">
                              <button
                                type="button"
                                className="button secondary"
                                disabled={!!rowBusy}
                                aria-label={`${value ? "Hide" : "Reveal"} code ${recipient}`}
                                aria-pressed={!!value}
                                aria-busy={busy}
                                onClick={async () => {
                                  if (value) {
                                    setRevealed((current) => {
                                      const next = { ...current };
                                      delete next[entry.id];
                                      return next;
                                    });
                                    setCopied("");
                                    return;
                                  }
                                  if (revealPending.current) return;
                                  revealPending.current = true;
                                  const epoch = secretGeneration.current;
                                  setRowBusy(entry.id);
                                  setRowError((current) => ({
                                    ...current,
                                    [entry.id]: "",
                                  }));
                                  try {
                                    const response = await fetch(
                                      "/api/portal",
                                      {
                                        method: "POST",
                                        credentials: "same-origin",
                                        cache: "no-store",
                                        headers: {
                                          "content-type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          action: "admin-reveal-credit",
                                          data: { inventoryId: entry.id },
                                        }),
                                      },
                                    );
                                    const result = (await response.json()) as {
                                      value?: string;
                                      code?: string;
                                      message?: string;
                                    };
                                    if (!response.ok)
                                      throw new Error(portalErrorText(result));
                                    if (
                                      typeof result.value !== "string" ||
                                      !result.value
                                    )
                                      throw new Error(
                                        "This code could not be revealed.",
                                      );
                                    const code = result.value;
                                    if (
                                      active.current &&
                                      epoch === secretGeneration.current &&
                                      !document.hidden
                                    )
                                      setRevealed((current) => ({
                                        ...current,
                                        [entry.id]: code,
                                      }));
                                  } catch (cause) {
                                    if (active.current)
                                      setRowError((current) => ({
                                        ...current,
                                        [entry.id]: (cause as Error).message,
                                      }));
                                  } finally {
                                    revealPending.current = false;
                                    if (active.current) setRowBusy("");
                                  }
                                }}
                              >
                                {busy ? (
                                  <LoaderCircle
                                    size={18}
                                    className="credit-batch-spinner"
                                    aria-hidden="true"
                                  />
                                ) : value ? (
                                  <EyeOff size={18} aria-hidden="true" />
                                ) : (
                                  <Eye size={18} aria-hidden="true" />
                                )}
                              </button>
                              <button
                                type="button"
                                className="button secondary"
                                disabled={!value || busy}
                                aria-label={`${copied === entry.id ? "Copied" : "Copy"} code ${recipient}`}
                                data-copied={copied === entry.id}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(value);
                                    setCopied(entry.id);
                                  } catch {
                                    setRowError((current) => ({
                                      ...current,
                                      [entry.id]:
                                        "Copy failed. Select and copy the revealed code.",
                                    }));
                                  }
                                }}
                              >
                                {copied === entry.id ? (
                                  <CircleCheck size={18} aria-hidden="true" />
                                ) : (
                                  <Copy size={18} aria-hidden="true" />
                                )}
                              </button>
                            </div>
                          </div>
                          {rowError[entry.id] && (
                            <p className="credit-stock-row-error" role="alert">
                              {rowError[entry.id]}
                            </p>
                          )}
                        </td>
                        <td role="cell" data-label="Assigned at">
                          {entry.assignedAt ? (
                            <time dateTime={entry.assignedAt}>
                              {ist(entry.assignedAt)}
                            </time>
                          ) : entry.status === "Available" ? (
                            "Not assigned"
                          ) : (
                            "Time unavailable"
                          )}
                        </td>
                        <td role="cell" data-label="Status">
                          <span
                            className={`credit-stock-status${entry.status === "Assigned" ? " is-assigned" : ""}`}
                          >
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              {!loading && !data?.items.length && (
                <tr>
                  <td colSpan={4} className="credit-stock-empty">
                    No matching codes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <footer className="credit-stock-pagination">
        <span role="status" aria-live="polite">
          {loading
            ? "Loading stock…"
            : data
              ? `${data.totalRows} ${data.totalRows === 1 ? "code" : "codes"} · Page ${page + 1}`
              : ""}
        </span>
        <div>
          <button
            className="button secondary"
            type="button"
            disabled={loading || page === 0}
            aria-label="Previous stock page"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={loading || !data?.hasMore}
            aria-label="Next stock page"
            onClick={() => setPage((value) => value + 1)}
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </footer>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Code copied." : ""}
      </span>
    </section>
  );
}
