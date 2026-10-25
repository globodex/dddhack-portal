import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SelectedProfileRequest,
  ProfileLookupError,
} from "../app/participant-profile-info";

test("selected profile HTML401 remains sign-in actionable before JSON parsing", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<html>Sign in required</html>", {
      status: 401,
      headers: { "content-type": "text/html" },
    });
  try {
    await assert.rejects(
      new SelectedProfileRequest().read("synthetic"),
      (error) =>
        error instanceof ProfileLookupError &&
        error.status === 401 &&
        /Sign in/.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("selected profile HTML503 and malformed JSON show concise retry text rather than parser diagnostics", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [
      new Response("<html>Gateway unavailable</html>", { status: 503 }),
      new Response("{bad-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(
        new SelectedProfileRequest().read("synthetic"),
        (error) =>
          error instanceof ProfileLookupError &&
          /Try again/.test(error.message) &&
          !/SyntaxError|Unexpected token|JSON|<html>/.test(error.message),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("selected profile legitimate JSON authorization explanation is preserved", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { message: "This participant profile is no longer available." },
      { status: 403 },
    );
  try {
    await assert.rejects(
      new SelectedProfileRequest().read("synthetic"),
      (error) =>
        error instanceof ProfileLookupError &&
        error.status === 403 &&
        error.message === "This participant profile is no longer available.",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("selected profile default15s timeout bounds a transport that ignores abort and permits a fresh retry", async (t) => {
  const original = globalThis.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  globalThis.fetch = (_url, options) => {
    signal = options?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  };
  try {
    const request = new SelectedProfileRequest();
    let settled = false;
    const pending = request.read("synthetic");
    void pending
      .finally(() => {
        settled = true;
      })
      .catch(() => {});
    const rejected = assert.rejects(
      pending,
      (error) =>
        error instanceof ProfileLookupError &&
        error.status === 408 &&
        error.retryable &&
        /timed out.*Try again/.test(error.message),
    );
    t.mock.timers.tick(14_999);
    await Promise.resolve();
    assert.equal(signal?.aborted, false);
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    await rejected;
    assert.equal(signal?.aborted, true);
    globalThis.fetch = async () =>
      Response.json({
        focusedPerson: { id: "synthetic", name: "Fresh retry", socials: [] },
      });
    assert.equal((await request.read("synthetic")).name, "Fresh retry");
  } finally {
    globalThis.fetch = original;
    t.mock.timers.reset();
  }
});

test("selected profile timeout also bounds a stalled response body and cancellation is silent", async (t) => {
  const original = globalThis.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let bodyStarted = false;
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      body: null,
      json: () => {
        bodyStarted = true;
        return new Promise(() => {});
      },
    }) as unknown as Response;
  try {
    const request = new SelectedProfileRequest();
    const pending = request.read("synthetic");
    const rejected = assert.rejects(
      pending,
      (error) => error instanceof ProfileLookupError && error.status === 408,
    );
    await Promise.resolve();
    assert.equal(bodyStarted, true);
    t.mock.timers.tick(15_000);
    await rejected;
    globalThis.fetch = () => new Promise<Response>(() => {});
    const canceled = request.read("synthetic");
    const closed = assert.rejects(canceled, { name: "AbortError" });
    request.cancel();
    await closed;
  } finally {
    globalThis.fetch = original;
    t.mock.timers.reset();
  }
});

test("selected profile success cleans the15s timer instead of aborting a completed request", async (t) => {
  const original = globalThis.fetch;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  globalThis.fetch = async (_url, options) => {
    signal = options?.signal as AbortSignal;
    return Response.json({
      focusedPerson: { id: "synthetic", name: "Complete", socials: [] },
    });
  };
  try {
    await new SelectedProfileRequest().read("synthetic");
    t.mock.timers.tick(15_000);
    assert.equal(signal?.aborted, false);
  } finally {
    globalThis.fetch = original;
    t.mock.timers.reset();
  }
});

test("selected profile malformed nonJSON denial stays retryable without changing a legitimateJSON denial", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("<html>Temporary denial page</html>", { status: 403 });
    await assert.rejects(
      new SelectedProfileRequest().read("synthetic"),
      (error) =>
        error instanceof ProfileLookupError &&
        error.status === 403 &&
        error.retryable,
    );
    globalThis.fetch = async () =>
      Response.json(
        { message: "Ask an organizer to restore access." },
        { status: 403 },
      );
    await assert.rejects(
      new SelectedProfileRequest().read("synthetic"),
      (error) =>
        error instanceof ProfileLookupError &&
        error.status === 403 &&
        !error.retryable &&
        error.message === "Ask an organizer to restore access.",
    );
  } finally {
    globalThis.fetch = original;
  }
});
