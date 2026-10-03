# Competitive CAD Workflow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The Site owner implements and integrates; bounded research and final review return findings only.

**Goal:** Implement the ten additions in the competitive UX review and publish the validated release.

**Architecture:** Extend existing React/Three/Manifold workflows with small shared pure helpers and accessible dialogs. Keep view-only focus outside model geometry; use independent evaluation for exports. Extend the editable schema only for optional saved views, and migrate local Dexie data for recoverable projects.

**Tech Stack:** TypeScript, React, Zustand, Three.js, Manifold, Dexie, Vitest; existing Sites Worker preserved.

**Spec:** `docs/COMPETITIVE_UX_REVIEW_2026-10-03.md`.

## Global constraints

- Preserve existing editable projects, undo, locks, Boolean assemblies, cloud behavior, and user data.
- Canonical model coordinates remain millimeters. No silent import unit guesses or source changes during print layout.
- Bound file sizes, mesh counts, saved views, and layout complexity. Fail unsupported formats visibly.
- Use `codex/competitive-workflow-upgrade`; push each commit for CI, create/merge PR, validate main, publish the exact successful main artifact publicly.
- User has explicitly authorized researching, choosing and implementing additions; continue through implementation and release without repeated approval gates.

## Review focus

Stale async exports/imports; partial Boolean group visibility; malformed/oversized 3MF including cyclic references; pending autosaves during trash/restore; stale slicer data and camera/import numeric validation. Add regression cases to the owning task.

## Tasks

- [x] 1. Add `cadToolCatalog.ts` and command search tests; update `CommandMenu` and exact inspector destinations. Validate synonym lookup and unavailable prerequisites; browser-check disclosure opening.
- [x] 2. Add bounded import helpers/core 3MF parsing and an `ImportReview` dialog; wire `App`. Test units, transforms, malformed data, size limits and scale/axis conversion; browser-check cancel/confirm.
- [x] 3. Extract `ExportDialog` with independent scope evaluation, scoped analysis and included-source summary. Extend `exportScope`; test grouping, visible scope, cancellation and stale material result handling.
- [x] 4. Add a starter catalog/dialog using existing functional recipes and evaluated thumbnails; connect workshop/help/community. Test all starters with real geometry and verify honest concept presentation.
- [x] 5. Add transient selection focus and overlap chooser, plus inspector reveal. Test complete-selection semantics, document switches and restored visibility; verify browser focus exit.
- [x] 6. Extend evaluated print analysis with bed-position checks; add actionable summaries and downloadable report. Test translated/floating/below-bed meshes and report scope.
- [x] 7. Add pure bounded plate packing and export preview; test spacing, preserved geometry, overflow and component count. Browser-check source unchanged after export.
- [x] 8. Add optional validated named camera views, viewport event bridge and controls. Test finite/nondegenerate poses, backup compatibility and bounded names/count; browser save/restore.
- [x] 9. Add Dexie trash/restore preserving checkpoints and deletion serialization; workshop Trash UI. Test pending saves cannot revive trashed projects and restore retains history.
- [x] 10. Track last-opened project and prefer it during hydration; safely fall back when missing/trashed. Test older-project resume and storage failures.
- [x] Run full check/test/build, independent review, and desktop/phone acceptance. Save accepted screenshots and evidence.
- [ ] Commit/push validated batches; verify every commit pipeline; PR/merge and main CI.
- [ ] Publish exact successful main artifact, verify native deployment and live contract, hand off public site and report.

## Implementation record

Baseline: clean `e04fd420`, 292 tests and main CI already verified immediately before this review. Eight current screenshots captured from public version 3; prior screenshots are not audit evidence. Implementation is kept in the existing checkout on the authorized feature branch.

All ten implementation steps completed. Browser acceptance: actual editable enclosure; text-search deep link; STL inch scaling and cancel; 3MF inch geometry confirmation; 80 × 50 × 5 mm selected lid export; two-solid arrangement without source changes; solid selection and three-hit overlap picker; isolation exit; camera save/restore and reload; Trash restoration retains Recovery acceptance checkpoint; last-opened project reload; desktop and 390px controls. Independent reviewer findings on stale export, source picking, malformed import allocation/expansion, GLB chunk ambiguity and starter cancellation were fixed and regression checked. Final full checks and deployment evidence follow in the competitive review.
