import { teamPhone } from "./phone";
export type ProfileViewer = {
  id: string;
  role: string;
  owner?: boolean;
  deactivated?: boolean;
  canParticipate?: boolean;
};
export type SelectedProfileFacts = {
  bio: string;
  socials: string;
  gender: string;
  genderDescription: string;
  profession: string;
  organization: string;
  openaiOrgId: string;
  phone: string;
  sameTeam: number;
};
/** The same field permissions for selected modals and inline project members. */
export function selectedProfileFacts(
  extra: SelectedProfileFacts,
  viewer: ProfileViewer,
  personId: string,
) {
  const admin =
    !viewer.deactivated && (viewer.owner || viewer.role === "admin");
  const participant = !viewer.deactivated && viewer.canParticipate === true;
  const personal = admin || (participant && viewer.id === personId);
  return {
    ...(personal
      ? { bio: extra.bio, socials: JSON.parse(extra.socials || "[]") }
      : {}),
    details: {
      ...(extra.gender ? { gender: extra.gender } : {}),
      ...(personal
        ? {
            ...(extra.profession?.trim()
              ? { profession: extra.profession }
              : {}),
            ...(extra.organization?.trim()
              ? { organization: extra.organization }
              : {}),
            ...(extra.genderDescription?.trim()
              ? { genderDescription: extra.genderDescription }
              : {}),
          }
        : {}),
      ...(admin && /^org-[A-Za-z0-9_-]+$/.test(extra.openaiOrgId || "")
        ? { openaiOrgId: extra.openaiOrgId }
        : {}),
      ...(admin || (participant && extra.sameTeam === 1)
        ? teamPhone(extra.phone)
        : {}),
    },
  };
}
