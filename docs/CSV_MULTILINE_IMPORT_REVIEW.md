# Luma CSV multiline import review

Base: `0b5f130221c37b5ca206de58bf6535c53ebfcdeb`. Local review only, no live file or participant data used.

## Verified behavior and limits

- Properly quoted multiline cells already worked. LF/CRLF, embedded blank lines, commas, escaped double quotes and following columns stay in their original records. The frontend reads `File.text()` and sends the complete string; it does not split records into physical lines. UTF-8 decoding can remove the initial BOM, and the backend's roster input trim also removes it.
- The Team details question is not a profile-prefill field and does not create teams or import embedded member emails. Its header contains the word Email, so it can appear among candidate email headers. The admin must choose the actual participant email column when multiple candidates exist. That choice is preserved; no heuristic overrides it.
- At the baseline, Website values required a full HTTPS URL. A bare domain failed independently of valid multiline Team answers. This batch now normalizes the first website value as described below. Other social URL rules and email identity/normalization are unchanged.
- Error row numbers identify nonempty logical CSV records, with the header as row1. Newlines inside quoted cells do not advance the logical row. Empty records outside cells remain ignored, matching existing behavior.
- The original real CSV is unavailable. These findings do not establish whether that particular file was well formed or what caused its Website error.

## Narrow fixes

The shared parser now accepts a leading BOM before a quoted header and rejects stray text after a closing quote instead of concatenating it silently. It still accepts spaces/tabs after closing quotes for compatibility, preserves embedded quoted newlines and applies the same byte, row and column limits. Unmatched/misplaced quotes and inconsistent widths return the logical row and a concise re-export instruction, without echoing cell values. Participant import preserves those contextual errors in the UI.

No changes to mapping policy, profile visibility, shared URL validation, add-only imports, statuses or transaction boundaries. CSV Website normalization is an explicit scoped addition; other URL fields are unchanged. Preview/commit failure tests verify no participant is partially imported.

## Temporary workaround

Keep the original CSV. Open a copy in a spreadsheet and delete only the unused Team details question column, then export CSV again. This safely removes that optional question and its extra email-header candidate; it is not a required workaround for valid multiline CSV. If the spreadsheet itself shows broken records, obtain a fresh source export instead of joining/splitting participant lines by hand. On the currently published version, separately keep only the first actual full HTTPS Website value or clear that optional cell if unavailable; deleting Team details cannot repair a bad Website value.

## First Website value

Only the CSV Product / Portfolio website field uses `rosterFirstWebsite`. It accepts a first bare domain, www. address, HTTP or HTTPS URL, common Website/Portfolio labels and simple enclosing punctuation. It normalizes to HTTPS and keeps the first candidate in textual order. Common whitespace/newline/comma/semicolon/ampersand list separators work; query strings, fragments and ordinary path punctuation are preserved rather than split blindly. For example `https://arexa.co & bharatxr.co` becomes `https://arexa.co`.

An unsafe or malformed first value fails; a later valid URL does not rescue it. Nonweb schemes, credentials, custom ports, local/IP hosts, arbitrary prose prefixes and unbalanced enclosing punctuation are refused. This is conservative extraction, not acceptance of arbitrary text. Blank optional Website cells remain blank. No URL is fetched and HTTPS reachability is not verified.

The existing staff-only preview returns each canonical Website. The same canonical value participates in the preview digest and is recomputed at commit. The existing confirmation includes a compact expandable Websites list by logical row, with text only, so the owner can review it without a new preview step. UI-only review metadata is excluded from the strict API payload. Existing participants remain skipped, including their saved website edits.

## Release implications

The parser executes in the backend, so publishing the fix later requires a refreshed backend ZIP and owner-run deployment. No schema/migration or provider configuration is needed. The existing ZIP has deliberately not been rebuilt or changed in this review batch. The UI error-message change requires the corresponding frontend release. No push, deployment or live import is authorized by this checkpoint.

## Validation

- 61/61 affected checks passed with no skips: multiline import, first Website normalization, Luma prefills, import error/control contracts, credit CSV batches, exports, core portal flows and admin integration.
- Typecheck and final webpack production build passed. No new backend archive was built.
- Actual local browser: 9 checks across 1440×900, 390×844 and 320×480. File upload with quoted CRLF/blank lines and escaped quotes shows the same canonical first Website in the existing confirmation; no horizontal overflow; Escape cancels with zero commits; malformed quote error shows logical Row3. Six screenshots remain outside Git under `/tmp/ddd-csv-browser/`, with `report.json`. Browser POST previews used the actual import service against a disposable synthetic in-memory database; no hosted traffic or URL fetches.
