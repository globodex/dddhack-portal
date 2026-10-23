// Sanitized query templates only; never accepts SQL bind arguments.
export function normalizeSQL(sql) {
  return String(sql)
    .replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "'?'")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}
