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
export const defaultPublicContent = {
  venue: "IIIT Delhi",
  mapUrl: "",
  agenda: [
    {
      time: "Schedule to follow",
      title: "A day to build",
      description: "The final agenda will be confirmed by the hosts.",
    },
  ],
  faqs: [
    { question: "When is it?", answer: "1 November 2026, 8 AM–8 PM IST." },
    {
      question: "Where is it?",
      answer:
        "IIIT Delhi, New Delhi. Exact arrival details are shared privately with authorized participants.",
    },
    {
      question: "Can I participate solo?",
      answer:
        "Yes. Teams can have up to five members; every member must register individually.",
    },
    {
      question: "Does Luma registration confirm my place?",
      answer:
        "No. Luma is for registration. Only individuals marked Going on this portal can be accommodated.",
    },
    {
      question: "What does locking a team do?",
      answer:
        "The leader freezes its membership and details for organizer review. Locking does not approve its members.",
    },
    {
      question: "How do I find a team?",
      answer:
        "Sign in, complete your profile, then search Teams by name and request to join.",
    },
    {
      question: "Can I upvote projects?",
      answer: "Yes. Sign in and upvote directly on Projects.",
    },
  ],
  rules:
    "Only individuals Going on the portal can be accommodated. Every member must register. Teams have at most five members. No parking is available. Pre-made rosters and ideas lock together on 29 October at 23:59 IST. Submissions open 1 November at 08:00 IST and close at 16:00 IST, unless the owner publishes an extension. At least one member must check in before a team can submit. Exactly three committed submissions; after the third, no project edits. Repository creation AND first commit must both be strictly after 1 November 2026 at 08:00 IST. Only individually checked-in members qualify for prizes or rewards; an absent member does not disqualify the team. Deployment link is optional.",
};
