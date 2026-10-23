import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDelhiMask } from "../lib/delhi-mask";

test("Delhi mask shares one fetched Blob and waits for its decode before reveal", async (t) => {
  let finishDecode!: () => void;
  let decodeStarted!: () => void;
  const decoding = new Promise<void>((resolve) => {
    decodeStarted = resolve;
  });
  let imageSource = "";
  let requests = 0;
  const revoked: string[] = [];
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: class {
      set src(value: string) {
        imageSource = value;
      }
      decode() {
        return new Promise<void>((resolve) => {
          finishDecode = resolve;
          decodeStarted();
        });
      }
    },
  });
  t.after(() => {
    if (originalImage)
      Object.defineProperty(globalThis, "Image", originalImage);
    else Reflect.deleteProperty(globalThis, "Image");
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (path: string, init: RequestInit) => {
      requests++;
      assert.equal(path, "/art/delhi-v3/text-mask-alpha.png");
      assert.ok(init.signal);
      return new Response(new Blob(["mask-pixels"], { type: "image/png" }));
    },
  );
  t.mock.method(URL, "createObjectURL", (blob: Blob) => {
    assert.equal(blob.type, "image/png");
    return "blob:decoded-mask";
  });
  t.mock.method(URL, "revokeObjectURL", (url: string) => {
    revoked.push(url);
  });
  const controller = new AbortController();
  let revealed = false;
  const loading = loadDelhiMask(controller.signal).then((mask) => {
    revealed = true;
    return mask;
  });
  // Let fetch and blob reads settle, while image decode remains deliberately held.
  await decoding;
  assert.equal(requests, 1);
  assert.equal(imageSource, "blob:decoded-mask");
  assert.equal(revealed, false);
  finishDecode();
  const mask = await loading;
  assert.equal(mask.url, imageSource);
  assert.deepEqual(revoked, []);
  controller.abort();
  mask.dispose();
  assert.deepEqual(revoked, ["blob:decoded-mask"]);
});

test("Delhi mask decode failure revokes the Blob and never returns a reveal URL", async (t) => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: class {
      src = "";
      async decode() {
        throw new Error("invalid image");
      }
    },
  });
  t.after(() => {
    if (originalImage)
      Object.defineProperty(globalThis, "Image", originalImage);
    else Reflect.deleteProperty(globalThis, "Image");
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(new Blob(["bad-mask"])),
  );
  t.mock.method(URL, "createObjectURL", () => "blob:failed-mask");
  const revoked: string[] = [];
  t.mock.method(URL, "revokeObjectURL", (url: string) => {
    revoked.push(url);
  });
  await assert.rejects(
    loadDelhiMask(new AbortController().signal),
    /invalid image/,
  );
  assert.deepEqual(revoked, ["blob:failed-mask"]);
});
