import { deflateSync } from "node:zlib";
export function syntheticImage(w: number, h: number) {
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) {
      c ^= byte;
      for (let n = 0; n < 8; n++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, b: Buffer) => {
    const t = Buffer.from(name),
      n = Buffer.alloc(4),
      end = Buffer.alloc(4);
    n.writeUInt32BE(b.length);
    end.writeUInt32BE(crc(Buffer.concat([t, b])));
    return Buffer.concat([n, t, b, end]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (1 + w * 4) + 1 + x * 4;
      raw[i] = 30;
      raw[i + 1] = 130;
      raw[i + 2] = 90;
      raw[i + 3] = 255;
    }
  return (
    "data:image/png;base64," +
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]).toString("base64")
  );
}
