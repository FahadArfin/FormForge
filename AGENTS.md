# PrintLab beta release policy

The user requested beta-only releases on October 25, 2026 because a friend uses the live site.

- Work on `codex/beta` or feature branches based on it. Do not merge into GitHub `main`, push changes to `main`, or publish the original Site until the user explicitly asks to merge beta into main.
- `.openai/hosting.json` is the active beta destination. `.openai/hosting.production.json` is a reference only, never a deployment input during beta-only work.
- Read `.openai/release.json`; run `npm run check:release` before packaging or publishing. Preserve beta's audience unless the user asks to change it.
- Keep production and beta cloud databases/uploads separate. Do not copy production user records, credentials or tokens. Browser projects are origin-local; use editable project backups to transfer a chosen design.
- Preserve project formats, undo/redo and recovery. Validate geometry through the existing worker. Splitting into meshes requires a recovery checkpoint before applying.
- Validate changes, review, and publish the exact CI build to beta. A draft PR may target main for review, but MUST remain unmerged until explicitly authorized.
- When promotion is requested, reconcile source changes, deliberately restore production hosting identity, remove beta-only labeling/noindex settings, test, and release the reviewed production artifact. Never copy beta user data automatically.
