# Sticky header regression

Source `8e90450443fd3dc61ddad88448ca4cec8395d494`; Worker `901580c960143319604987bfb37f67e336b5bd228c0d6d8244dcd87515daea13`.

Three targeted local synthetic checks passed at 834×1194, 1194×834 and 390×844. Each page scrolled, the header stayed at top 0 with a white background, and no horizontal overflow appeared. The three original scrolled viewport captures were opened and inspected: the header now obscures the content beneath it and preserves readable brand/menu controls. This closes the transparent-header finding from the earlier e0fbc27 Dashboard comparison for these tested dimensions.

No writes, external requests, page errors or blocked requests. Browser closed; compiled Worker hash unchanged. `report.json` contains geometry and capture paths. This targeted rerun does not supersede earlier source-bound full Dashboard receipts.
