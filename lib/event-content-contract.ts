import { z } from "zod";
export const plain = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(v),
      "Use plain text without HTML or control characters.",
    );
export const mapsUrl = z
  .string()
  .max(2048)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        ((["www.google.com", "google.com", "maps.google.com"].includes(
          u.hostname,
        ) &&
          (u.pathname.startsWith("/maps") ||
            u.hostname === "maps.google.com")) ||
          u.hostname === "maps.app.goo.gl" ||
          (u.hostname === "goo.gl" && u.pathname.startsWith("/maps")))
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS Google Maps link, without credentials.");
export const publicContentSchema = z
  .object({
    venue: plain(300),
    mapUrl: mapsUrl,
    agenda: z
      .array(
        z
          .object({
            time: plain(60),
            title: plain(120),
            description: plain(800),
          })
          .strict(),
      )
      .max(30),
    faqs: z
      .array(z.object({ question: plain(200), answer: plain(2000) }).strict())
      .max(30),
    rules: plain(10000),
  })
  .strict();
export const privateVenueSchema = z
  .object({ location: plain(1500), directions: plain(4000), mapUrl: mapsUrl })
  .strict();
// Compatibility export for server consumers. Browser code imports the pure data module.
export { defaultPublicContent } from "./public-content-defaults";
