# Beta-only releases

Effective October 25, 2026, per the user's request. Do not merge beta into main or publish production until the user explicitly asks.

| Environment | Branch | Site |
| --- | --- | --- |
| Active beta | `codex/beta` | https://printlab-beta.fwad101.chatgpt.site |
| Frozen production | `main` | https://formforge.fwad101.chatgpt.site |

The active `.openai/hosting.json` belongs to beta. Production's identity is retained in `.openai/hosting.production.json` for an explicitly authorized future promotion. `.openai/release.json` records both identities. `npm run check:release` prevents packaging with the production identity/origin or from the main branch. Builds run this guard. This is a local build guard, not an external account permission boundary.

Beta is a new owner-private Site. Its database and uploaded files start empty; existing schema migrations provision its own DB and BUCKET. Bundled community starter designs remain available. Production cloud records, published community designs/comments, and uploads are not copied. Local projects, bookmarks and preferences are isolated by browser origin. To try a production design in beta, download its editable project backup, then import that backup into beta. The original stays where it is.

## Release

1. Work on beta or a feature branch based on beta. Keep production unchanged.
2. Run release guard, types, unit tests, production build, entry budget and desktop/phone regression tests. Review changes; a draft PR may target main but must stay unmerged.
3. After CI completes, download the exact artifact matching the reviewed commit; do not rebuild it for deployment.
4. Use Sites source/package helpers with the active beta ID only, then publish the saved artifact to beta. Preserve its audience.
5. Verify beta navigation and changed CAD workflows, asset provenance, authentication/storage boundaries, and unchanged production version/assets.

## Future promotion (requires user request)

Review the beta diff and any newer main changes. Deliberately restore production hosting identity and update the release guard/config, Beta badge and noindex metadata. Keep production storage intact; do not migrate beta test records automatically. Validate that promotion artifact, merge only after authorization, then deploy it to the production Site and verify live behavior.

## CAD limits

Split connectors convert evaluated geometry to meshes, with recovery checkpoint and Undo preserving the source. Physical fit depends on printer/material settings and requires a test print. Multi-edge finishing targets supported parametric boxes; arbitrary imported topology and certified strength are not implied.
