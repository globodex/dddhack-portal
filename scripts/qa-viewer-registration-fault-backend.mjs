// Disposable HTTP response-fault fixture; application/auth code remains unchanged.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const log = "evidence/viewer-registration/after/backend-fault-trace.jsonl";
const server = createServer(async (req, res) => {
  const started = Date.now();
  const path = req.url || "/";
  try {
    if (
      /(?:^|;\s*)qa_viewer_fault=server(?:;|$)/.test(
        req.headers.cookie || "",
      ) &&
      path.startsWith("/api/portal")
    ) {
      res.writeHead(503, {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      });
      res.end(
        JSON.stringify({
          code: "BACKEND_UNAVAILABLE",
          message: "Synthetic backend unavailable. Try again.",
        }),
      );
      appendFileSync(
        log,
        JSON.stringify({
          started,
          method: req.method,
          path,
          status: 503,
          fixture: "controlled-server-503",
        }) + "\n",
      );
      return;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v != null && !["host", "connection", "content-length"].includes(k))
        headers.set(k, Array.isArray(v) ? v.join(",") : v);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const upstream = await fetch("http://127.0.0.1:8853" + path, {
      method: req.method,
      headers,
      ...(!["GET", "HEAD"].includes(req.method)
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(
      upstream.status,
      Object.fromEntries(
        [...upstream.headers].filter(
          ([k]) =>
            !["content-length", "content-encoding", "connection"].includes(k),
        ),
      ),
    );
    res.end(body);
    appendFileSync(
      log,
      JSON.stringify({
        started,
        method: req.method,
        path,
        status: upstream.status,
        fixture: "passthrough-current-synthetic-backend",
      }) + "\n",
    );
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ code: "QA_UPSTREAM_UNAVAILABLE", message: e.message }),
    );
    appendFileSync(
      log,
      JSON.stringify({
        started,
        method: req.method,
        path,
        status: 502,
        error: e.message,
      }) + "\n",
    );
  }
});
server.listen(8855, "127.0.0.1", () =>
  console.log("QA Viewer response-fault bridge8855 → ownbackend8853"),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
