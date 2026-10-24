# Historical owner-access focus regression

Source `19cb5362fcd4367a02fc04b3230d82f1cb854d91`. Real owner list, exact name/email/ID confirmation and minimal owner-only response passed. Escape dismissed the dialog, but the Revoke opener remained inactive after the focus assertion timeout. No role POST was sent. The pending state disabled the opener before the shared modal captured it.

The narrow AddAdmins fix is `fd6d03905abf4ac89527622682b9993b36795ab5`. The final [six passing rendered checks and eight reviewed original screenshots](../admin-owner-access-final-hydrated/README.md) include Escape focus restoration,503 retry, persisted revoke and real Add restoration.

Original screenshots are retained without resizing. Mobile full-page list frames in this historical folder have sticky-header screenshot positioning artifacts because the initial harness did not reset its scroll position. The final evidence corrects the harness and provides the visual comparison. The native320px confirmation frame and failed focus assertion remain valid evidence of the original keyboard defect.
