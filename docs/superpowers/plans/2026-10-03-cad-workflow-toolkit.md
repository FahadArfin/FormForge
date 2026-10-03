# CAD Workflow Toolkit Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the ten ordered workflow priorities with reliable, understandable behavior.

**Architecture:** Retain canonical millimeter mesh geometry, the existing document/undo pipeline, and local project persistence. Add small pure helpers and focused panels; separate background export/split computation from interactive geometry builds. New inspection state is transient.

**Tech Stack:** TypeScript, React, Zustand, Three.js, Manifold WASM, Vitest, Vite.

**Spec:** `docs/CAD_WORKFLOW_PRIORITIES.md`.

## Global constraints

- Preserve existing projects, lock protection, undo, saves, imports, and manufacturing exports.
- Do not claim standards compliance, constant-wall shelling, physical fit, or measured popularity.
- Canonical lengths remain millimeters. Bounded finite inputs and explicit operation errors.
- Root owns Git commits/push/PR/release. Every commit is pushed for validation.

## Review focus

- Compound rotations and negative scales must agree between viewport and worker (task 1).
- Invalid/oversized expressions and recipe parameters must leave the model unchanged (tasks 2/3/5).
- Boolean groups, locked nodes, and world-space sculpt strokes must remain coherent (tasks 6/8/10).
- Changing project during asynchronous evaluation must not replace/export the wrong project (tasks 8/10).
- Old projects without variants must load, and stale variant references must fail visibly (task 9).

## Ordered tasks

Each task: write a meaningful failing regression, run it, implement, rerun its focused tests, review the diff. Start tasks in priority order; independent verification can overlap later implementation. Commit coherent completed batches only after checks pass.

1. **Transforms:** shared transform convention in `lib/modelGeometry.ts` / helper and `geometry/geometry.worker.ts`; real Manifold bounds tests for [30,45,60] rotation and mirrored scale.
2. **Precision entry:** `lib/numericExpression.ts` and `components/NumberInput.tsx`; `parseNumericExpression(text, kind)` returns a finite canonical value or throws. Tests: units, fractions, precedence, invalid dimensions, divide by zero, length/depth cap, no mutation on invalid commit.
3. **Holes:** pure recipes in `lib/cadRecipes.ts`, `components/CadToolsPanel.tsx`; constructors return validated ordinary nodes, inserted through one add-nodes command. Tests all five types, clearance, bounded inputs, real solid subtraction.
4. **Measure:** pure pick helper plus `Viewport.tsx` and `ViewportTools.tsx`; visible-result vertex/surface hits, XYZ deltas and stale clearing. Tests transformed vertex positions and clipping exclusion.
5. **Coupons:** extend recipe helper/panel; `createFitCoupon` returns nodes plus sample labels. Tests count bounds, increasing diameters and separately positioned gauge.
6. **Plate:** `lib/platePlacement.ts` and store actions plus inspector/print controls; one rigid translation from union bounds. Tests locked/grouped/sculpted cases, undo and final bounds.
7. **Section:** transient store settings, Three material clipping, compact inspection panel. Tests plane sign and hit visibility; browser verify offset/flip and unchanged source revision.
8. **Split:** worker/client operation and pure output conversion; evaluate/split a captured document, guarded atomic replace, one undo. Real Manifold tests volume conservation, capped topology, outside-plane failure, stale operation rejection.
9. **Variants:** optional schema snapshots and pure validation/application helper plus focused panel. Tests legacy parse, name/count limits, formula preservation, renamed references, undo.
10. **Selection export:** `lib/exportScope.ts`, isolated geometry client, explicit scope in `TopBar.tsx`. Tests complete group inclusion, unrelated exclusion, cutter-only rejection, global sculpt constraints, snapshot capture.

## Release

- [x] Full check/test/build and independent code review (256 tests passed).
- [x] Browser QA: precision edit, hole/coupon creation, measurement, placement, section, split, variants, export scope; desktop and narrow layout.
- [ ] Commit/push completed changes; verify every commit workflow and PR checks; merge PR.
- [ ] Verify main pipeline, download exact successful web artifact, package via Sites workflow, save/deploy existing public site, poll terminal success.
- [x] Record completed features, validation and remaining roadmap honestly in `docs/CAD_TOOLKIT_VALIDATION_2026-10-03.md`.
