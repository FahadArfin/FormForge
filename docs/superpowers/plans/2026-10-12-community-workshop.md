# Community workshop implementation

Extend the existing gallery, editor, Sites identity and D1 storage. No replacement editor or new auth system.

## Findings and decisions
- Four concept illustrations currently dominate discovery; none contains geometry.
- Tag labels cannot filter; searches match one substring; filters are not available in saved/history views.
- Comments are browser-only, hidden for concepts, and rating counters can mislead.
- Remix copies work, but attribution is lost when the copy is saved.
- Publishing currently only saves to browser storage.

## Milestones
1. Add authenticated public design publication and threaded comments using existing Sites identity, additive D1 migrations, bounded requests and ownership checks. Public reads require no login. No existing private projects become public automatically.
2. Add eight actual editable starter designs generated with existing parametric recipes. Persist remix source attribution in optional backward-compatible document metadata. Keep concept illustrations clearly marked.
3. Rework browsing with multi-tag AND filters, category/type filters, useful sorting, URL/back-button persistence, active filter removal, pagination, saved/history/profile search, related items and a clear Create entry point.
4. Add visible public discussion for starters/concepts/shared designs, replies, author deletion, refresh/load-more, account status and offline errors. Keep legacy private notes available separately. Provide explicit public-publish form with alias/license/permission confirmation; preserve local-save option and project privacy.
5. Regression tests for API access/limits, filtering/routes, attribution/persistence and browser create/remix/comment/publish flows. Run tests, typecheck, build, entry budget and responsive suites. Review feature branch, pass CI, publish exact validated artifact and verify public assets and community endpoints.

## Risks and constraints
Public comments need server authorization and bounded writes, not local pretend success. Do not expose email or account IDs. Public publishing must explicitly explain document contents and require user action. No invented social/print statistics. Image-only concepts are not remixes. Preserve all current local storage keys and old documents. Test local API behavior separately from actual authenticated production evidence; report any authentication verification limit.
