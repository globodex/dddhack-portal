"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, Copy, Search } from "lucide-react";
import { portalErrorText } from "../lib/ui-feedback";
import { ist } from "../lib/time";
import styles from "./admin-credit-stock.module.css";

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
  value: string | null;
  codeAvailability: "ready" | "unavailable";
  codeError: string | null;
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
    [rowError, setRowError] = useState<Record<string, string>>({}),
    [copied, setCopied] = useState("");
  const active = useRef(true),
    generation = useRef(0),
    summary = useRef(onSummary),
    listId = useId();
  summary.current = onSummary;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
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
          signal: controller.signal,
        });
        const body = (await response.json()) as StockPage & {
          code?: string;
          message?: string;
        };
        if (!response.ok) throw new Error(portalErrorText(body));
        if (
          !Array.isArray(body.items) ||
          body.items.length > 25 ||
          !body.summary ||
          body.items.some(
            (entry) =>
              !(entry.value === null || typeof entry.value === "string") ||
              !(
                entry.codeError === null || typeof entry.codeError === "string"
              ),
          )
        )
          throw new Error("Stock could not be loaded.");
        if (active.current && epoch === generation.current) {
          setData(body);
          summary.current(body.summary);
        }
      } catch (cause) {
        if (
          active.current &&
          epoch === generation.current &&
          !controller.signal.aborted
        )
          setError((cause as Error).message);
      } finally {
        if (active.current && epoch === generation.current) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [typeId, status, query, page, attempt]);

  return (
    <section
      className={`credit-stock-detail ${styles.visibleCodes}`}
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
                    const value = entry.value,
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
                            {value ? (
                              <code
                                aria-label={
                                  value
                                    ? `Code for ${entry.person || "available stock"}`
                                    : "Code unavailable"
                                }
                              >
                                {value}
                              </code>
                            ) : (
                              <span className={styles.unavailable}>
                                Code unavailable
                              </span>
                            )}
                            <div className="credit-stock-code-actions">
                              <button
                                type="button"
                                className="button secondary"
                                disabled={!value}
                                aria-label={`${copied === entry.id ? "Copied" : "Copy"} code ${recipient}`}
                                data-copied={copied === entry.id}
                                onClick={async () => {
                                  if (!value) return;
                                  const epoch = generation.current;
                                  try {
                                    await navigator.clipboard.writeText(value);
                                    if (
                                      active.current &&
                                      epoch === generation.current
                                    )
                                      setCopied(entry.id);
                                  } catch {
                                    if (
                                      active.current &&
                                      epoch === generation.current
                                    )
                                      setRowError((current) => ({
                                        ...current,
                                        [entry.id]:
                                          "Copy failed. Select and copy the code.",
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
                          {entry.codeError && (
                            <p className="credit-stock-row-error">
                              {entry.codeError}
                            </p>
                          )}
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
