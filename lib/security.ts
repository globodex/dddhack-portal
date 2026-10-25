import { z } from "zod";
import { automaticAuditReason } from "./audit-contract";
export class PortalError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
  ) {
    super(message);
  }
}
export function demand(
  condition: unknown,
  status: number,
  code: string,
  message = code,
): asserts condition {
  if (!condition) throw new PortalError(status, code, message);
}
export function auditReason(max = 1000, min = 1) {
  return z.preprocess(
    (value) =>
      value == null || (typeof value === "string" && !value.trim())
        ? automaticAuditReason
        : value,
    z.string().trim().min(min).max(max),
  );
}
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const text = (max = 2000) => z.string().trim().min(1).max(max);
export const httpsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password && !u.port;
    } catch {
      return false;
    }
  }, "Use a public HTTPS URL without credentials or custom ports");
export const githubUrl = httpsUrl.refine(
  (v) => /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(v),
  "Use a public github.com owner/repository URL",
);
export async function sha256(v: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function requireCreditKey(key: string | undefined) {
  let raw = new Uint8Array();
  try {
    if (key) raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  } catch {
    // Invalid encoding has the same fail-closed response as an absent key.
  }
  demand(raw.length === 32, 503, "CREDIT_KEY_UNAVAILABLE");
  return raw;
}
export async function seal(value: string, key: string | undefined) {
  const raw = requireCreditKey(key);
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    new TextEncoder().encode(value),
  );
  return (
    btoa(String.fromCharCode(...iv)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}
export async function unseal(value: string, key: string | undefined) {
  const raw = requireCreditKey(key);
  const [a, b] = value.split(".");
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "decrypt",
  ]);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(atob(a), (c) => c.charCodeAt(0)) },
      k,
      Uint8Array.from(atob(b), (c) => c.charCodeAt(0)),
    ),
  );
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csvExport(data: Record<string, unknown>[]) {
  if (!data.length) return "No records\r\n";
  const keys = Object.keys(data[0]);
  return [
    keys.map(csvCell).join(","),
    ...data.map((row) =>
      keys
        .map((k) =>
          csvCell(typeof row[k] === "object" ? JSON.stringify(row[k]) : row[k]),
        )
        .join(","),
    ),
  ].join("\r\n");
}
export function parseCSV(input: string): string[][] {
  demand(
    new TextEncoder().encode(input).length <= 512_000,
    413,
    "CSV_TOO_LARGE",
  );
  const rows: string[][] = [];
  // An optional UTF-8 BOM precedes the first field, including a quoted header.
  const source = input.replace(/^\uFEFF/, "");
  let row: string[] = [],
    cell = "",
    quote = false,
    closedQuote = false;
  const quoteError = (detail: string) =>
    demand(
      false,
      422,
      "INVALID_CSV_QUOTE",
      `Row ${rows.length + 1}: ${detail}`,
    );
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quote = false;
        closedQuote = true;
      } else cell += c;
    } else if (c === ",") {
      row.push(cell.trim());
      cell = "";
      closedQuote = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      closedQuote = false;
    } else if (closedQuote) {
      if (c !== " " && c !== "\t")
        quoteError(
          "Text follows a closing quote. Re-export the CSV with correctly quoted cells.",
        );
    } else if (c === '"') {
      if (cell.length)
        quoteError(
          "A quote appears inside an unquoted field. Re-export the CSV with correctly quoted cells.",
        );
      quote = true;
    } else cell += c;
  }
  if (quote)
    quoteError(
      "A quoted field is not closed. Re-export the CSV with correctly quoted cells.",
    );
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  demand(rows.length <= 1001, 422, "CSV_ROW_LIMIT");
  demand(rows.length > 1, 422, "CSV_EMPTY");
  const width = rows[0].length;
  const mismatch = rows.findIndex((r) => r.length !== width);
  demand(
    mismatch === -1,
    422,
    "CSV_COLUMN_MISMATCH",
    `Row ${mismatch + 1}: Expected ${width} columns. Check quotes and re-export the CSV.`,
  );
  return rows;
}
export function feedbackQuality(value: string, min = 30, max = 500) {
  const v = value.trim();
  return (
    v.length >= min &&
    v.length <= max &&
    v.split(/\s+/).length >= 6 &&
    !/(.)\1{7}/.test(v) &&
    new Set(v.toLowerCase().replace(/[^a-z0-9]/g, "")).size >= 10 &&
    !/^(good|great|awesome|gg|nice|test)([\s.!]*)$/i.test(v)
  );
}
export function checkMutationRequest(request: Request) {
  const origin = request.headers.get("origin");
  demand(origin === new URL(request.url).origin, 403, "ORIGIN_MISMATCH");
  demand(
    request.headers.get("content-type")?.startsWith("application/json"),
    415,
    "JSON_REQUIRED",
  );
}
