const MASK = "[masked]";
const MAX_TEXT = 10_000;

const sensitiveName =
  /(?:^|[_\s.-])(?:api[_\s-]?key|key|token|password|passwd|pwd|secret|credential|authorization|auth|voucher|code|signature|sig)(?:$|[_\s.-])/i;
const assignment =
  /\b((?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|private[ _-]?key|authorization|credential|password|passwd|pwd|token|secret|voucher|code|key)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\\n])*(?:"|$)|'(?:\\.|[^'\\\n])*(?:'|$)|`(?:\\.|[^`\\\n])*(?:`|$)|<[^>\n]*(?:>|$)|[^\s,;<>?&#]+)/gi;
const providerToken =
  /\b(?:sk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9_-]{8,}|(?:gh[opusr]_|github_pat_)[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|(?:AKIA|ASIA)[A-Z0-9]{12,}|AIza[A-Za-z0-9_-]{20,}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,})\b/g;
const opaqueToken = /[A-Za-z0-9_+/=-]{28,}/g;

function maskKnownValues(text: string, values: string[]) {
  try {
    const literals = [
      ...new Set(
        values.flatMap((value) => {
          const trimmed = value.trim();
          if (!trimmed) return [];
          return [
            value,
            trimmed,
            encodeURIComponent(value),
            encodeURIComponent(trimmed),
            encodeURIComponent(value).replace(/%20/g, "+"),
            encodeURIComponent(trimmed).replace(/%20/g, "+"),
          ].filter(Boolean);
        }),
      ),
    ].sort((a, b) => b.length - a.length);
    if (!literals.length) return text;
    // Match existing masks as a unit so a one-character voucher cannot corrupt
    // a mask emitted by credential detection. Replacements are never re-read.
    const pattern = literals
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    return text.replace(new RegExp(pattern + "|\\[masked\\]", "g"), MASK);
  } catch {
    // Audit text is optional. A pathological literal set must fail closed.
    return MASK;
  }
}

function maskURL(urlText: string) {
  try {
    const url = new URL(urlText);
    let changed = false;
    if (url.username || url.password) {
      url.username = MASK;
      url.password = "";
      changed = true;
    }
    for (const key of [...new Set(url.searchParams.keys())]) {
      if (sensitiveName.test(key.replace(/([a-z])([A-Z])/g, "$1_$2"))) {
        url.searchParams.set(key, MASK);
        changed = true;
      }
    }
    // Fragments can contain OAuth bearer material and are never needed in audit.
    if (url.hash) {
      url.hash = MASK;
      changed = true;
    }
    return changed ? url.toString().replace(/%5Bmasked%5D/gi, MASK) : urlText;
  } catch {
    return MASK;
  }
}

/** Audit metadata only. Never use this result to reconstruct a voucher. */
export function sanitizeCreditAuditText(
  text: string,
  voucherValues: string[],
): string {
  let safe = text.replace(
    /\b[A-Za-z][A-Za-z0-9+.-]{1,20}:\/\/[^\s<>"'`]+/g,
    maskURL,
  );
  safe = safe.replace(
    /-----BEGIN [^-\r\n]*(?:PRIVATE KEY|SECRET)[^-\r\n]*-----[\s\S]*?(?:-----END [^-\r\n]+-----|$)/g,
    MASK,
  );
  safe = safe.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${MASK}`);
  safe = safe.replace(assignment, (_match, label: string) => label + MASK);
  safe = safe.replace(providerToken, MASK);
  // Long uninterrupted material is not needed to explain a credit import.
  safe = safe.replace(opaqueToken, MASK);
  // Detect credentials first: a voucher equal to "key" must not destroy an
  // assignment label before its otherwise-unrecognized value can be masked.
  // Sanitize complete matches before truncating to avoid voucher prefixes.
  return maskKnownValues(safe, voucherValues).slice(0, MAX_TEXT);
}

export type CreditAuditColumn = {
  heading: string;
  instructions: string;
  values: string[];
};

export function creditAuditMetadata(columns: CreditAuditColumn[], additionalValues: string[] = []) {
  const allValues = [...additionalValues, ...columns.flatMap((column) => column.values)];
  return columns.map((column) => ({
    heading: sanitizeCreditAuditText(column.heading, allValues),
    instructions: sanitizeCreditAuditText(column.instructions, allValues),
    count: column.values.length,
    samples: column.values.slice(0, 5).map((_value, index) => ({
      row: index + 1,
      value: MASK,
    })),
  }));
}
