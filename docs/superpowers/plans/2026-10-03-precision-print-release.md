# Precision, print guidance and accessible workflow implementation plan

> For agentic workers: use superpowers:executing-plans. The Site owner implements and integrates; delegated work is read-only research and review.

**Goal:** Complete user-selected priorities 4–8: resilient editing, direct precision controls, print/fit guidance, a useful public website and templates, and keyboard/touch access.

**Architecture:** Keep the editable document and command/undo model. Add a lightweight public entry outside the lazy CAD application; bounded geometry jobs and recovery snapshots; controlled sketch selection; read-only print overlays and explicitly recorded calibration. Reuse the existing recipes, printer settings, cloud snapshots and design tokens.

**Tech stack:** React, TypeScript, Three.js, Manifold worker, Dexie, Vitest, existing Sites Worker.

**Spec:** The five selected priorities in this conversation and the concrete scope below. User authorized implementation and the existing branch/CI/PR/public-release workflow; no further approval gate is needed.

## Constraints and acceptance

- Existing local projects, cloud snapshots, undo, exports and schema compatibility remain supported.
- Real geometry powers previews. Template print status is explicitly unverified until a human supplies a physical result; no fabricated photos or test claims.
- Overhangs are geometric slope advisories, not support simulation. Keep local wall analysis deferred until it can be validated; explain slicer checks.
- Geometry cancellation terminates work, late results cannot overwrite newer revisions, failed jobs can retry, and cache memory is bounded.
- Saved recovery copies are transactional and bounded. Browser shutdown can still interrupt unsaved work; visibility/page lifecycle attempts a flush and dirty navigation warns.
- Public pages load independently of CAD. Preserve hash links and safe saves when navigating away from an edited project.
- Keyboard alternatives, focus restoration, readable contrast, reduced motion and touch targets must be browser checked.

## Review focus

1. Cancel/retry and stale worker messages after project changes; tests in geometry/client.test.ts.
2. Failed/interrupted saves and Trash retaining recovery; tests in lib/db.test.ts and projectPersistence.test.ts.
3. Sketch selection after insertion/deletion, conflicting constraints and preview/click agreement; tests in sketch interaction helpers and UI.
4. Downward geometry, bed-contact exclusion and stale overlays; tests in overhang analysis with known triangles.
5. Invalid calibration data, printer/material mismatch, and templates that cannot silently replace current work; bounded validation and existing safe navigation.

## Ordered implementation

- [x] 4a. Geometry lifecycle: failing cancellation/timeout/cache tests; lazy workers, replace obsolete jobs, bounded cache, elapsed build status, cancel/retry.
- [x] 4b. Recovery: failing transaction/retention tests; three previous saved revisions, recovery UI, lifecycle save flush, dirty-leave guard.
- [x] 4c. Loading and benchmarks: lazy public/CAD boundaries, defer heavy dialogs/imports; representative geometry benchmark script and results with machine/fixture limits.
- [x] 5a. Interactive sketch canvas: point/edge selection shared with constraint editor, visible conflicts, editable edge dimensions through solver, numeric keyboard alternative.
- [x] 5b. Precision feedback: match profile hover/click snapping, show snap status, expose selected dimensions beside canvas using existing transform operations.
- [x] 6a. Print overlays: bounded downward-slope analysis, printer threshold, highlighted geometry preview, explicit bed/bridge/wall limits.
- [x] 6b. Calibration: reuse fit coupons; save validated measured printer/material results and notes, match current setup, clearly distinguish diametral from radial clearance.
- [x] 7. Public home/templates: lightweight functional entry, real interactive demo loaded on request, searchable recipe metadata/dimensions/instructions, explicit print evidence status, safe transitions to editor.
- [x] 8. Accessibility: dialog descriptions, focus recovery, mobile drawer focus/inert, control labels, touch targets, contrast, reduced motion and non-drag alternatives.
- [x] Full validation: type checks, complete tests, build, independent review, actual desktop/phone interaction checks and screenshots.
- [ ] Release: feature branch commit/push and pipeline, PR, merge after checks, exact main artifact to public Sites, verify deployment and live artifact.
