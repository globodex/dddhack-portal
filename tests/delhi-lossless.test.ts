import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const sharp = createRequire(import.meta.url)("sharp");
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DelhiWordmark, { loadDelhiLayer } from "../app/delhi-wordmark";

const originals = {
  "fallback-approved-v3":
    "bec57daa23b34ee1786e7d3d7fd68939ff943756a11cb4b589c21aab1e5235eb",
  "delhi-fill-overscan":
    "325d353c1e874aeb98864741c9bf0e0fa6fb1f3e8657431cba02609576041f33",
  "metro-static":
    "b8de85137167a70568eeff715f5880fdebf6ce0998b7cdc8848016199016534c",
  "text-mask-alpha":
    "edc05d2a1af15111da7fe54934b40cb7513550016c066d41a3f97d4c98b76ecb",
};
test("smaller lossless WebPs preserve every decoded RGBA byte and original PNG hash/dimensions", async () => {
  for (const [name, hash] of Object.entries(originals)) {
    const png = readFileSync(`public/art/delhi-v3/${name}.png`);
    const webp = readFileSync(`public/art/delhi-v3/${name}.webp`);
    assert.equal(createHash("sha256").update(png).digest("hex"), hash, name);
    assert.ok(webp.length < png.length, name);
    const original = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const compressed = await sharp(webp)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual(compressed.info, original.info, name);
    assert.equal(
      original.info.width,
      name === "delhi-fill-overscan" ? 2112 : 2048,
    );
    assert.equal(
      original.info.height,
      name === "delhi-fill-overscan" ? 832 : 768,
    );
    assert.ok(
      compressed.data.equals(original.data),
      `${name}: includes colour in fully transparent pixels`,
    );
  }
});

test("SSR offers a typed WebP fallback without preloading its original PNG or any motion layers", () => {
  const html = renderToStaticMarkup(createElement(DelhiWordmark));
  assert.match(
    html,
    /<picture><source type="image\/webp" srcSet="\/art\/delhi-v3\/fallback-approved-v3.webp"\/>/,
  );
  assert.match(html, /src="\/art\/delhi-v3\/fallback-approved-v3.png"/);
  assert.doesNotMatch(
    html,
    /rel="preload"|delhi-fill-overscan|metro-static|text-mask-alpha/,
  );
});

test("moving artwork tries WebP decode first and preserves original PNG recovery", async (t) => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const requests: string[] = [];
  let failWebp = false;
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: class {
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) {
        requests.push(value);
        queueMicrotask(() => this.onload?.());
      }
      async decode() {
        if (failWebp && requests.at(-1)?.endsWith(".webp"))
          throw new Error("Unsupported WebP");
      }
    },
  });
  t.after(() => {
    if (originalImage)
      Object.defineProperty(globalThis, "Image", originalImage);
    else Reflect.deleteProperty(globalThis, "Image");
  });
  const signal = new AbortController().signal;
  assert.equal(
    await loadDelhiLayer("metro-static", signal),
    "/art/delhi-v3/metro-static.webp",
  );
  assert.deepEqual(requests, ["/art/delhi-v3/metro-static.webp"]);
  requests.length = 0;
  failWebp = true;
  assert.equal(
    await loadDelhiLayer("metro-static", signal),
    "/art/delhi-v3/metro-static.png",
  );
  assert.deepEqual(requests, [
    "/art/delhi-v3/metro-static.webp",
    "/art/delhi-v3/metro-static.png",
  ]);
  requests.length = 0;
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    loadDelhiLayer("metro-static", aborted.signal),
    /abort/i,
  );
  assert.deepEqual(requests, []);
});
