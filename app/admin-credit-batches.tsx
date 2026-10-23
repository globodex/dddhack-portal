"use client";
import { useRef, useState } from "react";
import { FileUp, LoaderCircle, Trash2, Upload } from "lucide-react";
import CreditInstructions from "./credit-instructions";
import { previewAdminAction } from "./admin-import-controls";
import { useAdminOperation, type AdminRun } from "./admin-participant-actions";

export type CreditBatchColumnDraft = {
  key: string;
  heading: string;
  instructions: string;
  count: number;
};
export type CreditBatchPreview = {
  digest: string;
  rowCount: number;
  columns: { key: string; heading: string; count: number }[];
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
        !column.instructions.trim(),
    )
  )
    throw new Error("Add a heading and instructions for each column.");
  return {
    csv,
    digest: preview.digest,
    columns: columns.map(({ key, heading, instructions }) => ({
      key,
      heading: heading.trim(),
      instructions: instructions.trim(),
    })),
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
  const { busy, error, execute } = useAdminOperation();
  const label = column ? `Delete ${column.heading}` : "Delete batch";
  return (
    <div className="credit-batch-delete">
      <button
        type="button"
        className="button secondary"
        aria-label={
          column
            ? `Delete column: ${column.heading}`
            : `Delete credit batch: ${batch.id}`
        }
        aria-busy={busy}
        disabled={busy}
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
        {busy ? "Deleting…" : column ? "Delete column" : "Delete batch"}
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

export default function AdminCreditBatches({
  batches = [],
  run,
}: {
  batches?: AdminCreditBatch[];
  run: AdminRun;
}) {
  const [csv, setCSV] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CreditBatchPreview | null>(null);
  const [columns, setColumns] = useState<CreditBatchColumnDraft[]>([]);
  const [message, setMessage] = useState("");
  const source = useRef("");
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const previewOp = useAdminOperation(),
    publishOp = useAdminOperation();
  const reset = () => {
    generation.current++;
    setPreview(null);
    setColumns([]);
    setMessage("");
    previewOp.clearError();
    publishOp.clearError();
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    reset();
    await previewOp.execute(async () => {
      if (file.size > 512000) throw new Error("Use a CSV of at most 512 KB.");
      const epoch = generation.current;
      const text = await file.text();
      if (epoch !== generation.current) return;
      setCSV(text);
      source.current = text;
      setFileName(file.name);
    });
  };
  return (
    <div className="admin-credit-batches">
      <section
        className="credit-batch-editor"
        aria-labelledby="credit-batch-heading"
      >
        <h2 id="credit-batch-heading">Add credits</h2>
        {!preview ? (
          <form
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
                    instructions: "",
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
                disabled={previewOp.busy}
              >
                <FileUp size={18} aria-hidden="true" />
                Upload CSV
              </button>
              {fileName && <span>{fileName}</span>}
            </div>
            <label>
              Paste CSV
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
              disabled={previewOp.busy}
              aria-busy={previewOp.busy}
            >
              <PendingIcon busy={previewOp.busy} action="upload" />
              {previewOp.busy ? "Preparing…" : "Add credits"}
            </button>
            {previewOp.busy && (
              <span className="sr-only" role="status">
                Reading credit columns
              </span>
            )}
          </form>
        ) : (
          <form
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
                  newCount: columns.reduce(
                    (sum, column) => sum + column.count,
                    0,
                  ),
                });
                setCSV("");
                source.current = "";
                setFileName("");
                setPreview(null);
                setColumns([]);
                if (input.current) input.current.value = "";
                setMessage("Credits published.");
              });
            }}
          >
            <div className="credit-batch-preview-heading">
              <p>
                {preview.rowCount} rows · {preview.columns.length} columns
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={reset}
                disabled={publishOp.busy}
              >
                Change CSV
              </button>
            </div>
            <div className="credit-batch-column-editors">
              {columns.map((column, index) => (
                <section
                  className="credit-batch-column-editor"
                  key={column.key}
                >
                  <header>
                    <h3>{preview.columns[index].heading}</h3>
                    <span>{column.count} credits</span>
                  </header>
                  <label>
                    Heading
                    <input
                      aria-label={`Heading for ${preview.columns[index].heading}`}
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
                    Instructions (Markdown)
                    <textarea
                      aria-label={`Instructions for ${preview.columns[index].heading}`}
                      value={column.instructions}
                      required
                      readOnly={publishOp.busy}
                      maxLength={10000}
                      rows={5}
                      onChange={(event) =>
                        setColumns((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, instructions: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                </section>
              ))}
            </div>
            <div className="credit-batch-publish-actions">
              <button
                className="button"
                type="submit"
                disabled={publishOp.busy}
                aria-busy={publishOp.busy}
              >
                <PendingIcon busy={publishOp.busy} action="upload" />
                {publishOp.busy ? "Publishing…" : "Publish credits"}
              </button>
            </div>
            {publishOp.busy && (
              <span className="sr-only" role="status">
                Credit publication pending
              </span>
            )}
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
        {message && <p role="status">{message}</p>}
      </section>
      <PublishedCreditBatches batches={batches} run={run} />
    </div>
  );
}
