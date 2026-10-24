import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareProjectImage } from "../app/prepare-project-image";

test("image type, size, structure and dimensions are bounded before any browser decoder or object URL is created", async () => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const createUrl = URL.createObjectURL;
  let decoders = 0, urls = 0;
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class { constructor() { decoders++; throw new Error("Decoder reached"); } } });
  URL.createObjectURL = (() => { urls++; return "blob:synthetic"; }) as typeof URL.createObjectURL;
  const png = await sharp({ create: { width: 128, height: 192, channels: 4, background: {r:30,g:90,b:160,alpha:.5} } }).png().toBuffer();
  const huge = Buffer.from(png);huge.writeUInt32BE(50_000,16);
  const small = Buffer.from(png);small.writeUInt32BE(63,16);
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  try {
    for (const [name, bytes, type, kind] of [
      ["MIME mismatch", gif, "image/png", "logo"],
      ["unsupported MIME", png, "image/gif", "logo"],
      ["truncated PNG", png.subarray(0,28), "image/png", "logo"],
      ["oversized dimensions", huge, "image/png", "banner"],
      ["undersized dimensions", small, "image/png", "logo"],
      ["logo source cap", Buffer.alloc(1_000_001), "image/png", "logo"],
      ["banner source cap", Buffer.alloc(5_000_001), "image/png", "banner"],
    ] as const) {
      await assert.rejects(prepareProjectImage(new File([bytes], name, {type}),kind));
      assert.equal(decoders,0,name+" must not instantiate a decoder");
      assert.equal(urls,0,name+" must not create an object URL");
    }
    await assert.rejects(prepareProjectImage(new File([png],"valid-portrait.png",{type:"image/png"}),"logo"),/Decoder reached/);
    assert.equal(decoders,1,"valid arbitrary-aspect image reaches browser decoding");
  } finally {
    if(originalImage)Object.defineProperty(globalThis,"Image",originalImage);else delete (globalThis as any).Image;
    URL.createObjectURL=createUrl;
  }
});
