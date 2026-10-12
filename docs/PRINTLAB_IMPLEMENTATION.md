# PrintLab implementation ledger

Approved plan: Sites-first AI Engineering Studio (2026-10-11). Base: e961fa1.
Architecture and explicit limitations: [PRINTLAB_ARCHITECTURE.md](PRINTLAB_ARCHITECTURE.md).

## Delivered milestones

1. PrintLab UI, titles, reports, export attribution, teal identity and geometric favicon. Internal identifiers, repository and public URL preserved.
2. Engineering assistant, existing viewport, inspector and responsive switching panels; editable plan review with Preview, Apply and Discard.
3. Versioned strict CAD contract, allowlisted adapter, measured rack shelf and stable feature references. Each operation resolves parameters and evaluates isolated geometry. One atomic Apply, stale/cancellation protection, split recovery checkpoint.
4. Evidence-labeled inspection, hole targets, bounded orientation ranking, printer/material profiles, bounded real slicer metadata imports and fingerprinted currency.
5. Six top-level WebMCP Site tools with no Apply tool; optional administrator-configured loopback-only local model adapter.

## Validation

Baseline: npm run check, npm test (46 model + 452 web), npm run build passed.
Release tests: 49 model + 514 web + 8 local API integration tests passed; all type checks passed.
Production build verified 81 packaged public assets. Entry: 213,938 raw / 68,484 gzip bytes, within 300 KiB / 100 KiB budgets.
Real WASM acceptance: rack shelf, thickness 4, six slots, hole spacing 210, rounding 1.5, two-piece split, stable IDs and conserved split volume. Checkpoint failure/cancellation preserves source.
Compatibility tests: Dexie v4 to v5 projects/checkpoints/recovery, old editable schema, additive metadata and existing cloud compression envelope.
Actual supported browser: six tools discovered; valid plan and geometry preview; explicit UI Apply; editable nodes/parameters read back; missing-feature proposal rejected; original remained unchanged; tools removed on leaving studio.
Independent review: fixed indirect lock changes, silent primitive clamping, stale local-provider responses, persisted discarded proposals and late restoration races. No remaining source review blockers.
Desktop/phone suites include existing precision, recovery, export and modeling flows plus new proposal flow. Mobile toolkit overlap and studio grid regression found during verification were corrected.

## Scope boundaries

No hosted model key, allowance delegation, new OAuth system, public-site-to-localhost bridge, slicer execution or automatic printing.
Only primitive-supported rounding is offered. Orienting rotation-bound/attached-hole documents is rejected. Mesh splits disclose reduced editability and preserve recovery.
Slicer fixtures include attributed upstream emitted metadata; unknown producer/version or values remain unknown. Local adapter tests use a loopback mock provider, not an installed live model.
Physical fit, strength, thermal performance and actual printing remain unverified.

Final browser result: 28/28 desktop and phone Playwright workflows passed (2026-10-12).
