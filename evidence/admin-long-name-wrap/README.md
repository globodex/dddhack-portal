# Admin card name wrapping

Actual 320 x 480 pixels exposed text glyph clipping inside otherwise correctly sized cards. Unbroken team names painted into the chevron cell and were clipped by the card edge. The same happened in submission headings. Earlier box-bound checks missed this; the follow-up harness now measures text ranges too.

- [Team before](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-long-name-wrap/team-name-before-320.png), root source `244d68f`, local DOM-only stress name.
- [Submission before](https://github.com/Param302/dddhack-portal/blob/6fcb7d5be117d234ae60a4a4b04af966f9134af8/evidence/admin-alignment-2a6d865-320-final/submission-DOM-long-name.png), root source `2a6d865`, same DOM-only stress name.

The scoped CSS adds `overflow-wrap: anywhere` and `min-width: 0` only to those name blocks and their immediate grid containers. No overflow hiding, request, permission, contract, or database change. Actual post-fix capture remains pending root integration.
