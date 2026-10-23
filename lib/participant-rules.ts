import { ist } from "./time";
export function participantRules(open: string | null, close: string | null) {
  return [
    {
      title: "Registration and attendance",
      items: [
        "Every person registers individually. Luma is registration only; only individuals Going on this portal can be accommodated.",
        "Organizers approve Registered participants individually. A locked team does not make its members Going.",
        "Only individually checked-in members qualify for prizes or rewards. An absent member does not disqualify the team.",
      ],
    },
    {
      title: "Teams",
      items: [
        "Solo participation is welcome. Maximum five members per team.",
        "Pre-made roster and idea lock together on 29 October 2026 at 23:59 IST. The leader may voluntarily lock a completed team earlier; membership and details then freeze.",
      ],
    },
    {
      title: "Building, credits and submissions",
      items: [
        "Repository creation AND first commit must both be strictly after 1 November 2026, 08:00 IST. Repository history is operational evidence, not proof of original authorship.",
        "Only the personally checked-in team leader can submit or update a project. Submissions open " +
          (open ? ist(open) : "at the published opening time") +
          " and close " +
          (close ? ist(close) : "at the published deadline") +
          ".",
        "Exactly three committed submissions per team, including the initial version. Drafts and wizard navigation use no attempt. No project edits after the third commit.",
        "Project logo (1:1) and banner (16:9) are required. Deployment link is optional for all projects.",
        "Credits are personal to their assigned checked-in recipient. Use the current setup instructions; do not share private credit values.",
      ],
    },
    {
      title: "Evaluation and prizes",
      items: [
        "Eligible committed projects appear publicly; community order uses upvotes, then earliest first submission. Scoring and awards stay private until explicit admin reveal.",
        "Only submitted projects carry eligibility. A verified violation has a private reason; inaccessible repositories or evaluation outages need review and do not prove a violation.",
        "Admins and assigned judging reviewers may restore eligibility with a recorded reason. Only checked-in members of a winning team qualify for prizes or rewards.",
      ],
    },
    {
      title: "Conduct and venue",
      items: [
        "No parking is available.",
        "Respect fellow participants, organizers and the venue. Keep private directions and personal credits private.",
      ],
    },
  ];
}
