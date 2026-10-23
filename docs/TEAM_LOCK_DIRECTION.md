# Captured direction — voluntary team lock

This records the user's latest workflow direction only. No schema, team data, roles, Luma status or approval logic changed in this task.

- A leader voluntarily locks a completed team.
- Membership and team details then freeze.
- Admins can filter locked versus unlocked teams and export the member emails of the relevant teams.
- Param manually updates the corresponding people to Going in Luma. There is no automatic Luma synchronization or scraping.
- Team lock alone is neither approval nor Going. Keep individual approval separate and preserve the current derived Going rule unless the user explicitly changes it.
- The already-confirmed global October 29, 23:59 IST roster/idea lock remains in force; do not silently interpret voluntary early locking as removal of that global deadline.
- Check-in/Luma eligibility is still pending voice clarification. Do not infer it from a team lock, enable check-in or grant live capabilities.

Before implementing the state transition, clarify only genuinely unspecified behaviors: whether a leader can undo a lock, who can reopen/correct a locked team, and exactly which optional cosmetic/details edits are frozen. Do not invent an unlock path, override grant or expanded approval rule. The latest minimal two-step profile requirements and broader page design remain subject to their existing mockup review gate.


Latest correction: Going belongs to individuals, never teams. Team lifecycle is Forming → Locked → Not submitted → Submitted; committed submission eligibility is a separate chip. Manual Absent capability has no automatic cutoff. See OPERATIONAL_RELEASE_2026_10_23.md for implemented/tested rules.
