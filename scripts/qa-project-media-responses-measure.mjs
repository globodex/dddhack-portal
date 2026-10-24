import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const fixture = JSON.parse(
  (
    await readFile(
      process.env.MEDIA_FIXTURE_LOG || "/tmp/ddd-media-response-backend.log",
      "utf8",
    )
  )
    .trim()
    .split("\n")
    .at(-1),
);
if (fixture.synthetic !== true) throw Error("Synthetic fixture required");
const direct = process.env.MEDIA_MEASURE_DIRECT === "1";
const base = direct ? `http://127.0.0.1:${fixture.port}` : fixture.appOrigin;
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Local-only measurement");
const project = fixture.cases[0];
const routes = [
  { path: "/dashboard", role: "alice", case: "different-draft" },
  { path: "/submission", role: "alice", case: "different-draft" },
  { path: "/project-history", role: "alice", case: "three-unique-commits" },
  {
    path: `/admin/submissions/${project.projectId}`,
    role: "owner",
    case: "different-draft-and-published",
  },
  { path: "/admin/submissions", role: "owner", case: "metadata-list" },
  { path: "/projects", role: null, case: "public-list" },
  {
    path: "/api/portal?view=%2Fsubmission",
    role: null,
    case: "unauthenticated-error",
  },
  {
    path: "/api/portal?view=%2Fadmin%2Fsubmissions",
    role: "alice",
    case: "forbidden-error",
  },
  {
    path: `/api/project-image/${project.projectId}/logo?version=${project.versionId}`,
    role: null,
    case: "public-logo-raster",
  },
  {
    path: `/api/project-image/${project.projectId}/banner?version=${project.versionId}`,
    role: null,
    case: "public-banner-raster",
  },
];
const records = [];
async function measure(entry, path, representation) {
  const headers = { "accept-encoding": "identity" };
  if (entry.role) headers.cookie = `portal_local_fixture=${entry.role}`;
  if (direct) {
    headers["x-portal-proxy-secret"] = fixture.secret;
    headers["x-portal-forwarded-origin"] = fixture.appOrigin;
  }
  if (representation === "rsc") headers.RSC = "1";
  const requestUrl = new URL(path, base);
  // Next16 validates RSC cache-busting headers. With no router-tree headers the expected hash is empty.
  if (representation === "rsc") requestUrl.searchParams.set("_rsc", "");
  const response = await fetch(requestUrl, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(120000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type");
  const text = type?.includes("image/") ? "" : bytes.toString("utf8");
  const expectedStatus =
    entry.case === "unauthenticated-error"
      ? 401
      : entry.case === "forbidden-error"
        ? 403
        : 200;
  const expectedType =
    representation === "html"
      ? "text/html"
      : representation === "rsc"
        ? "text/x-component"
        : entry.case.startsWith("public-") && entry.case.endsWith("-raster")
          ? "image/jpeg"
          : "application/json";
  const record = {
    path,
    requestUrl: requestUrl.pathname + requestUrl.search,
    representation,
    fixture: entry.case,
    role: entry.role,
    status: response.status,
    expectedStatus,
    statusAndTypeMatch:
      response.status === expectedStatus && !!type?.includes(expectedType),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentType: type,
    cacheControl: response.headers.get("cache-control"),
    contentEncoding: response.headers.get("content-encoding"),
    imageDataUriOccurrences: (text.match(/data:image\//g) || []).length,
    belowConservative4M: bytes.length < 4000000,
  };
  if (
    ["public-list", "metadata-list"].includes(entry.case) &&
    record.imageDataUriOccurrences !== 0
  )
    throw Error(`Inline media in ${entry.case}`);
  records.push(record);
  console.log(JSON.stringify(record));
}
for (const entry of routes) {
  if (entry.path.startsWith("/api/")) {
    await measure(entry, entry.path, "api");
    continue;
  }
  await measure(
    entry,
    "/api/portal?view=" + encodeURIComponent(entry.path),
    "api",
  );
  if (!direct) {
    await measure(entry, entry.path, "html");
    await measure(entry, entry.path, "rsc");
  }
}
const destination = new URL(
  "../evidence/project-media-response/",
  import.meta.url,
);
await mkdir(destination, { recursive: true });
await writeFile(
  new URL(direct ? "api-report.json" : "next-report.json", destination),
  JSON.stringify(
    {
      source: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      syntheticOnly: true,
      uncompressedBodies: true,
      canonicalBinaryPairBytes: 524288,
      frontend: base,
      cases: fixture.cases,
      records,
    },
    null,
    2,
  ) + "\n",
);
if (records.some((row) => !row.belowConservative4M || !row.statusAndTypeMatch))
  process.exitCode = 1;
