"use client";
import { useHydrated } from "./use-hydrated";
import { useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  ChevronUp,
  FileUp,
  LoaderCircle,
  Trash2,
  Upload,
  Plus,
} from "lucide-react";
import CreditInstructions from "./credit-instructions";
import { previewAdminAction } from "./admin-import-controls";
import { useAdminOperation, type AdminRun } from "./admin-participant-actions";
import type { StockSummary } from "./admin-credit-stock";

export type CreditBatchColumnDraft = {
  key: string;
  heading: string;
  instructions: string;
  count: number;
  mode?: "new" | "restock";
  typeId?: string;
};
export type CreditBatchPreview = {
  digest: string;
  rowCount: number;
  columns: {
    key: string;
    sourceHeading?: string;
    heading: string;
    instructions?: string;
    count: number;
    typeId?: string;
    mode?: "new" | "restock";
    added?: number;
    duplicates?: number;
    retired?: number;
  }[];
  totals?: { added: number; duplicates: number; retired: number };
  rows: { row: number; cells: unknown[] }[];
};
export type AdminCreditBatch = {
  id: string;
  createdAt: string;
  columns: {
    id: string;
    typeId: string;
    heading: string;
    instructions: string;
    inventory: number;
    assigned: number;
    total?: number;
    available?: number;
    waiting?: number;
    exhausted?: boolean;
  }[];
};

export function creditBatchPublishValues(
  csv: string,
  preview: CreditBatchPreview,
  columns: CreditBatchColumnDraft[],
) {
  if (
    !csv.trim() ||
    !preview.digest ||
    !preview.columns.length ||
    columns.length !== preview.columns.length
  )
    throw new Error("Add a CSV before publishing.");
  if (
    columns.some(
      (column, index) =>
        column.key !== preview.columns[index].key ||
        !column.heading.trim() ||
        (preview.columns[index].mode !== "restock" &&
          !column.instructions.trim()),
    )
  )
    throw new Error("Add a heading and instructions for each column.");
  return {
    csv,
    digest: preview.digest,
    columns: columns.map(({ key, heading, instructions }, index) =>
      preview.columns[index].mode === "restock"
        ? {
            key,
            heading: preview.columns[index].heading,
            instructions: preview.columns[index].instructions || "",
          }
        : { key, heading: heading.trim(), instructions: instructions.trim() },
    ),
    confirmation: "PUBLISH_CREDIT_BATCH",
  };
}

export function creditBatchDeleteValues(batchId: string, columnId?: string) {
  if (!batchId) throw new Error("Choose a credit upload.");
  return {
    batchId,
    ...(columnId
      ? { columnId, confirmation: "DELETE_CREDIT_COLUMN" }
      : { confirmation: "DELETE_CREDIT_BATCH" }),
  };
}

function PendingIcon({
  busy,
  action,
}: {
  busy: boolean;
  action: "upload" | "delete";
}) {
  const Icon = busy ? LoaderCircle : action === "delete" ? Trash2 : Upload;
  return (
    <Icon
      size={18}
      className={busy ? "credit-batch-spinner" : undefined}
      aria-hidden="true"
      focusable="false"
    />
  );
}

function DeleteCreditControl({
  batch,
  column,
  run,
}: {
  batch: AdminCreditBatch;
  column?: AdminCreditBatch["columns"][number];
  run: AdminRun;
}) {
  const hydrated = useHydrated();
  const { busy, error, execute } = useAdminOperation();
  const label = column ? `Delete ${column.heading}` : "Delete batch";
  return (
    <div className="credit-batch-delete">
      <button
        type="button"
        className={`button secondary${column ? " credit-column-delete-icon" : ""}`}
        title={column ? `Delete column: ${column.heading}` : undefined}
        aria-label={
          column
            ? `Delete column: ${column.heading}`
            : `Delete credit batch: ${batch.id}`
        }
        aria-busy={busy}
        disabled={busy || !hydrated}
        onClick={() =>
          void execute(() =>
            run(
              column ? "delete-credit-column" : "delete-credit-batch",
              creditBatchDeleteValues(batch.id, column?.id),
            ),
          )
        }
      >
        <PendingIcon busy={busy} action="delete" />
        {!column && (busy ? "Deleting…" : "Delete batch")}
      </button>
      {busy && (
        <span className="sr-only" role="status">
          {label} pending
        </span>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function PublishedCreditBatches({
  batches,
  run,
}: {
  batches: AdminCreditBatch[];
  run: AdminRun;
}) {
  return (
    <section
      className="credit-batch-published"
      aria-label="Published credit uploads"
    >
      <h2>Uploads</h2>
      {!batches.length && <p>No uploads yet.</p>}
      {batches.map((batch) => (
        <article className="credit-batch-existing" key={batch.id}>
          <header>
            <div>
              <h3>
                {batch.columns.map((column) => column.heading).join(", ") ||
                  "Credit upload"}
              </h3>
              <time dateTime={batch.createdAt}>
                {new Date(batch.createdAt).toLocaleDateString("en-GB", {
                  timeZone: "UTC",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            </div>
            <DeleteCreditControl batch={batch} run={run} />
          </header>
          {batch.columns.map((column) => (
            <section className="credit-batch-existing-column" key={column.id}>
              <header>
                <div>
                  <h4>{column.heading}</h4>
                  <p>
                    {column.inventory} credits · {column.assigned} assigned
                  </p>
                </div>
                <DeleteCreditControl batch={batch} column={column} run={run} />
              </header>
              <CreditInstructions markdown={column.instructions} />
            </section>
          ))}
        </article>
      ))}
    </section>
  );
}

export type CreditCategory = {
  id: string;
  name: string;
  active?: boolean | number;
  inventory?: number;
  total?: number;
  assigned?: number;
  available?: number;
  waiting?: number;
  exhausted?: boolean;
};

function StockLoading() {
  return (
    <section
      className="credit-stock-detail"
      role="status"
      aria-label="Loading stock"
      aria-busy="true"
    >
      <div className="credit-stock-filters">
        <div className="credit-stock-filter-skeleton" />
        <div className="credit-stock-filter-skeleton" />
      </div>
      <div className="credit-stock-table-skeleton" />
      <div className="credit-stock-pagination-skeleton" />
    </section>
  );
}
const StockTable = dynamic(() => import("./admin-credit-stock"), {
  loading: StockLoading,
});

function CategoryStock({
  category,
  onAddMore,
  disabled,
}: {
  category: CreditCategory;
  onAddMore: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [live, setLive] = useState<{
      version: string;
      summary: StockSummary;
    } | null>(null),
    id = useId();
  const total = category.total ?? category.inventory,
    assigned = category.assigned,
    available =
      category.available ??
      (typeof total === "number" && typeof assigned === "number"
        ? Math.max(0, total - assigned)
        : undefined),
    version = JSON.stringify([total, assigned, available, category.waiting]),
    stock = (live?.version === version ? live.summary : null) || {
      total,
      assigned,
      available,
      waiting: category.waiting,
      exhausted: category.exhausted ?? available === 0,
    },
    active = category.active !== false && category.active !== 0;
  return (
    <article className="credit-stock-category">
      <header>
        <h2>{category.name}</h2>
        <span
          className={`credit-stock-status${active && !stock.exhausted ? " is-assigned" : ""}`}
        >
          {!active ? "Inactive" : stock.exhausted ? "Out of stock" : "Active"}
        </span>
      </header>
      <dl className="credit-stock-counters">
        {(
          [
            ["Total", stock.total],
            ["Assigned", stock.assigned],
            ["Available", stock.available],
            ["Waiting", stock.waiting],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {typeof value === "number" && Number.isFinite(value)
                ? value
                : "?"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="credit-stock-category-actions">
        <button
          type="button"
          className="button"
          disabled={disabled || !active}
          aria-label={`Add more ${category.name}`}
          onClick={onAddMore}
        >
          <Plus size={18} aria-hidden="true" />
          Add more
        </button>
        <button
          type="button"
          className="button secondary"
          aria-expanded={open}
          aria-controls={id}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide stock" : "View stock"}
          {open ? (
            <ChevronUp size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
        </button>
      </div>
      {open && (
        <div id={id}>
          <StockTable
            typeId={category.id}
            heading={category.name}
            key={version}
            onSummary={(summary) => setLive({ version, summary })}
          />
        </div>
      )}
    </article>
  );
}

export function creditImportCounts(preview: CreditBatchPreview) {
  return (
    preview.totals || {
      added: preview.columns.reduce((sum, column) => sum + column.count, 0),
      duplicates: 0,
      retired: 0,
    }
  );
}

export default function AdminCreditBatches({
  batches = [],
  categories,
  run,
}: {
  batches?: AdminCreditBatch[];
  categories?: CreditCategory[];
  run: AdminRun;
}) {
  const hydrated = useHydrated(),
    fallback = batches.flatMap((batch) =>
      batch.columns.map((column) => ({
        ...column,
        id: column.typeId,
        name: column.heading,
        active: true,
      })),
    ),
    catalog =
      categories !== undefined
        ? categories
        : [...new Map(fallback.map((column) => [column.id, column])).values()];
  const [csv, setCSV] = useState(""),
    [fileName, setFileName] = useState(""),
    [preview, setPreview] = useState<CreditBatchPreview | null>(null),
    [columns, setColumns] = useState<CreditBatchColumnDraft[]>([]),
    [composerOpen, setComposerOpen] = useState(!catalog.length),
    [manageOpen, setManageOpen] = useState(false),
    [context, setContext] = useState("");
  const source = useRef(""),
    generation = useRef(0),
    input = useRef<HTMLInputElement>(null),
    editor = useRef<HTMLDetailsElement>(null);
  const previewOp = useAdminOperation(),
    publishOp = useAdminOperation(),
    assignmentOp = useAdminOperation();
  const reset = () => {
    ++generation.current;
    setPreview(null);
    setColumns([]);
    previewOp.clearError();
    publishOp.clearError();
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    reset();
    await previewOp.execute(async () => {
      if (file.size > 512000) throw new Error("Use a CSV of at most 512 KB.");
      const epoch = generation.current,
        text = await file.text();
      if (epoch !== generation.current) return;
      setCSV(text);
      source.current = text;
      setFileName(file.name);
    });
  };
  const addMore = (name: string) => {
    reset();
    setCSV("");
    source.current = "";
    setFileName("");
    setContext(name);
    setComposerOpen(true);
    requestAnimationFrame(() =>
      editor.current?.scrollIntoView({ block: "start" }),
    );
  };
  const busy = previewOp.busy || publishOp.busy || assignmentOp.busy;
  const waitingForAssignment = catalog.some(
    (category) => (category.waiting || 0) > 0 && (category.available || 0) > 0,
  );
  return (
    <div className="admin-credit-batches">
      {waitingForAssignment && (
        <div className="credit-stock-assign-waiting">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !hydrated}
            aria-busy={assignmentOp.busy}
            onClick={() =>
              void assignmentOp.execute(async () => {
                await run("repair-credit-allocations", {});
                document.getElementById("main")?.focus({ preventScroll: true });
              })
            }
          >
            {assignmentOp.busy ? "Assigning…" : "Assign waiting"}
          </button>
          {assignmentOp.error && <p role="alert">{assignmentOp.error}</p>}
        </div>
      )}
      <div className="credit-stock-categories" aria-label="Credit stock">
        {catalog.map((category) => (
          <CategoryStock
            key={category.id}
            category={category}
            onAddMore={() => addMore(category.name)}
            disabled={busy || !hydrated}
          />
        ))}
      </div>
      <details
        ref={editor}
        className="credit-batch-new-upload"
        open={composerOpen}
        onToggle={(event) => setComposerOpen(event.currentTarget.open)}
      >
        <summary>
          <FileUp size={20} aria-hidden="true" />
          <span>{context ? `Add stock: ${context}` : "Add credits"}</span>
          <ChevronDown size={20} aria-hidden="true" />
        </summary>
        <section className="credit-batch-editor" aria-label="Add credits">
          {!preview ? (
            <form
              method="post"
              inert={!hydrated}
              data-hydrated={hydrated}
              onSubmit={(event) => {
                event.preventDefault();
                void previewOp.execute(async () => {
                  if (!csv.trim()) throw new Error("Upload or paste a CSV.");
                  source.current = csv;
                  const epoch = generation.current;
                  const result = await previewAdminAction<CreditBatchPreview>(
                    "preview-credit-batch",
                    { csv },
                  );
                  if (epoch !== generation.current) return;
                  if (
                    !result.digest ||
                    !Array.isArray(result.columns) ||
                    !result.columns.length ||
                    !Array.isArray(result.rows)
                  )
                    throw new Error("The CSV could not be read.");
                  setPreview(result);
                  setColumns(
                    result.columns.map((column) => ({
                      ...column,
                      instructions: column.instructions || "",
                    })),
                  );
                });
              }}
            >
              <div className="credit-batch-source-actions">
                <input
                  ref={input}
                  className="sr-only"
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Upload credits CSV"
                  onChange={(event) => void readFile(event.target.files?.[0])}
                />
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => input.current?.click()}
                  disabled={busy || !hydrated}
                >
                  <FileUp size={18} aria-hidden="true" />
                  Upload CSV
                </button>
                {fileName && <span>{fileName}</span>}
              </div>
              <label>
                <span>
                  Paste CSV{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <textarea
                  name="creditsCSV"
                  aria-label="Paste CSV"
                  value={csv}
                  required
                  rows={6}
                  maxLength={512000}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    reset();
                    setCSV(event.target.value);
                    source.current = event.target.value;
                    setFileName("");
                  }}
                />
              </label>
              <button
                className="button"
                type="submit"
                disabled={busy || !hydrated}
                aria-busy={previewOp.busy}
              >
                <PendingIcon busy={previewOp.busy} action="upload" />
                {previewOp.busy ? "Reading CSV…" : "Add credits"}
              </button>
            </form>
          ) : (
            <form
              method="post"
              inert={!hydrated}
              data-hydrated={hydrated}
              onSubmit={(event) => {
                event.preventDefault();
                void publishOp.execute(async () => {
                  const values = creditBatchPublishValues(
                    source.current,
                    preview,
                    columns,
                  );
                  const checked = await previewAdminAction<CreditBatchPreview>(
                    "preview-credit-batch",
                    { csv: values.csv, columns: values.columns },
                  );
                  if (
                    !checked.digest ||
                    !Array.isArray(checked.columns) ||
                    checked.columns.length !== columns.length
                  )
                    throw new Error("Credits could not be validated.");
                  await run("publish-credit-batch", {
                    ...creditBatchPublishValues(values.csv, checked, columns),
                    creditImportSummary: creditImportCounts(checked),
                    newCount: creditImportCounts(checked).added,
                  });
                  setCSV("");
                  source.current = "";
                  setFileName("");
                  setPreview(null);
                  setColumns([]);
                  setContext("");
                  setComposerOpen(false);
                  if (input.current) input.current.value = "";
                });
              }}
            >
              <div className="credit-batch-preview-heading">
                <div className="credit-import-counts" role="status">
                  <strong>{creditImportCounts(preview).added} to add</strong>
                  <span>
                    {creditImportCounts(preview).duplicates} duplicates skipped
                  </span>
                  {creditImportCounts(preview).retired > 0 && (
                    <span>
                      {creditImportCounts(preview).retired} previously removed
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="button secondary"
                  onClick={reset}
                  disabled={busy || !hydrated}
                >
                  Change CSV
                </button>
              </div>
              <div className="credit-batch-column-editors">
                {columns.map((column, index) => {
                  const checked = preview.columns[index],
                    restock = checked.mode === "restock";
                  return (
                    <section
                      className={`credit-batch-column-editor${restock ? " is-restock" : ""}`}
                      key={column.key}
                    >
                      <header>
                        <h3>
                          {restock
                            ? checked.heading
                            : checked.sourceHeading || checked.heading}
                        </h3>
                        <span>
                          {restock ? "Existing category" : "New category"}
                        </span>
                      </header>
                      {restock ? (
                        <div className="credit-existing-metadata">
                          <CreditInstructions
                            markdown={checked.instructions || ""}
                          />
                        </div>
                      ) : (
                        <>
                          <label>
                            <span>
                              Heading{" "}
                              <span
                                className="required-mark"
                                aria-hidden="true"
                              >
                                *
                              </span>
                            </span>
                            <input
                              aria-label={`Heading for ${checked.heading}`}
                              value={column.heading}
                              required
                              readOnly={publishOp.busy}
                              maxLength={100}
                              onChange={(event) =>
                                setColumns((current) =>
                                  current.map((item, i) =>
                                    i === index
                                      ? { ...item, heading: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>
                              Instructions (Markdown){" "}
                              <span
                                className="required-mark"
                                aria-hidden="true"
                              >
                                *
                              </span>
                            </span>
                            <textarea
                              aria-label={`Instructions for ${checked.heading}`}
                              value={column.instructions}
                              required
                              readOnly={publishOp.busy}
                              maxLength={10000}
                              rows={5}
                              onChange={(event) =>
                                setColumns((current) =>
                                  current.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          instructions: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="credit-batch-publish-actions">
                <button
                  className="button"
                  type="submit"
                  disabled={busy || !hydrated}
                  aria-busy={publishOp.busy}
                >
                  <PendingIcon busy={publishOp.busy} action="upload" />
                  {publishOp.busy
                    ? "Adding credits…"
                    : preview.columns.every(
                          (column) => column.mode === "restock",
                        )
                      ? "Add stock"
                      : "Publish credits"}
                </button>
              </div>
            </form>
          )}
          {previewOp.error && (
            <p className="error-message" role="alert">
              {previewOp.error}
            </p>
          )}
          {publishOp.error && (
            <p className="error-message" role="alert">
              {publishOp.error}
            </p>
          )}
        </section>
      </details>
      {batches.length > 0 && (
        <details
          className="credit-upload-management"
          open={manageOpen}
          onToggle={(event) => setManageOpen(event.currentTarget.open)}
        >
          <summary>
            Manage uploads <span>{batches.length}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          {manageOpen && <PublishedCreditBatches batches={batches} run={run} />}
        </details>
      )}
    </div>
  );
}
