// Instrumentation entry only for the disposable local harness. This file is
// supplied as a virtual sibling of the unchanged compiled Worker index.js.
import compiled from "./index.js";

import { normalizeSQL } from "./load-300-profile-normalize.mjs";

export default {
  async fetch(request, env, ctx) {
    const caseId = request.headers.get("x-load-profile-case");
    if (!caseId || !/^case-\d+$/.test(caseId))
      return new Response("Local profile case required", { status: 400 });
    const calls = [],
      originals = new WeakMap();
    async function measured(method, templates, operation) {
      const start = performance.now();
      let result,
        failed = false;
      try {
        result = await operation();
        return result;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        const results = Array.isArray(result) ? result : [result];
        calls.push({
          method,
          templates,
          elapsedMs: performance.now() - start,
          failed,
          engineMs: results.reduce(
            (n, r) => n + (Number(r?.meta?.duration) || 0),
            0,
          ),
          rowsRead: results.reduce(
            (n, r) => n + (Number(r?.meta?.rows_read) || 0),
            0,
          ),
          rowsWritten: results.reduce(
            (n, r) => n + (Number(r?.meta?.rows_written) || 0),
            0,
          ),
        });
      }
    }
    function statement(original, template) {
      const wrapped = {
        bind(...values) {
          return statement(original.bind(...values), template);
        },
        all(...args) {
          return measured("all", [template], () => original.all(...args));
        },
        first(...args) {
          return measured("first", [template], () => original.first(...args));
        },
        run(...args) {
          return measured("run", [template], () => original.run(...args));
        },
        raw(...args) {
          return measured("raw", [template], () => original.raw(...args));
        },
      };
      originals.set(wrapped, { original, template });
      return wrapped;
    }
    const DB = {
      prepare(sql) {
        return statement(env.DB.prepare(sql), normalizeSQL(sql));
      },
      batch(statements) {
        const entries = statements.map((s) => originals.get(s));
        if (entries.some((s) => !s))
          throw new Error("Untracked profile batch statement");
        return measured(
          "batch",
          entries.map((s) => s.template),
          () => env.DB.batch(entries.map((s) => s.original)),
        );
      },
      exec(sql) {
        return measured("exec", [normalizeSQL(sql)], () => env.DB.exec(sql));
      },
    };
    const start = performance.now();
    let response;
    try {
      response = await compiled.fetch(request, { ...env, DB }, ctx);
      return response;
    } finally {
      // Local service binding: this does not use outbound Internet fetch. No
      // SQL binds, identities, request/response bodies or error text are sent.
      await env.PROFILE_METRICS.fetch("http://profile.invalid/collect", {
        method: "POST",
        body: JSON.stringify({
          caseId,
          status: response?.status || null,
          workerMs: performance.now() - start,
          calls,
        }),
      });
    }
  },
};
