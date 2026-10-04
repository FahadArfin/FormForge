# Studio technical workflows implementation plan

**Goal:** Implement all six researched improvements in the existing studio.
**Architecture:** Independent analysis worker and measurement helpers; existing immutable model snapshots and store for edits/recovery. Root owns shared integration and release. Specialized implementation may run independently in disjoint files under the parallel-agent workflow.
**Tech stack:** React, TypeScript, Three.js, Manifold, Zustand, Vitest and existing Playwright CI. No new dependencies.
**Spec:** `docs/STUDIO_TECHNICAL_RESEARCH_2026-10-04.md`.

## Global constraints

- Branch `codex/studio-technical-workflows`, base `86c7e67ea7dc8e1cfc35c4fb39eebe0593ba20d2`; existing checkout is clean and retains the established branch workflow.
- All six priorities must ship together, with no placeholder controls. Each commit is pushed for CI. Merge only green, publish the exact main artifact to the existing public Site.
- Use native FormForge implementations. Preserve old saved documents; only add optional compatible annotation kind support.
- Analysis: at most 100,000 triangles, 20-second timeout, cancellation and stale-result rejection. No automatic external uploads.
- Keep preview/manual mode and session history transient. Preserve masks and locked geometry.

## Review focus

1. Stale asynchronous work after source, selection, project or dialog changes must not apply/download.
2. Bound parameters, face attachments, assembly members, locks and global sculpting must not be silently corrupted by transforms.
3. Open meshes, reversed faces, nested cavity shells, degenerate geometry and large translated coordinates must not produce misleading solid properties.
4. Manual builds and history jumps must not leave analysis, picking, exports or saving tied to a stale document.
5. Old annotations/projects must parse; collinear points and geometry edits must invalidate circle readings visibly.

## Tasks

- [x] 1. Mesh Doctor and evaluated properties. Add failing topology/mask/property tests, inspect failure, then implement `meshTools` improvements, `meshInspection` worker/client and two focused panels. Tests cover malformed indices, tiny valid triangles, duplicate/reversed faces, masks, translated boxes, cavities, open meshes, abort/timeout and stale UI. Root connects Inspector/commands.
- [x] 2. Circle measurement. Add failing circumcircle and annotation/schema tests, then implement math, `measure-circle` tool picking/overlay, inspection state, annotation panel and compatible schema/type extension. Test tilted planes, coincident/collinear/near-collinear points, transformed coordinates, pinning and staleness. Root connects App tool cancellation/phone behavior and command catalogue.
- [x] 3. Precision transforms. Add `precisionTransform` helper/panel and regression tests: complete assemblies, rotation about each pivot, scale, units, lock refusal, scalar bounds, no-op, stale draft and one-step Undo. Root integrates Prepare tools and commands.
- [x] 4. Session history. Add pure snapshot-label/timeline/jump helpers and tests. Add atomic `jumpHistory` store action, session list before checkpoints, and descriptive Undo/Redo tooltips. Test forward preservation, branching, invalid indices, cross-project refusal and placement guards.
- [x] 5. Manual rebuild mode. Add store tests proving cancellation, deferred autosaved edits, latest-only explicit rebuild, automatic resume and reset on project switch. Add controls and explicit pending banner/status, preserving export/analysis guards.
- [ ] 6. Integration/release. Add browser journeys for the six tools, capture desktop/phone after evidence, full types/unit/build/budget/browser checks, independent branch review, commit/push/PR/main CI, exact artifact deployment and live hash checks.

Research and design were presented inline before implementation. The user's instruction to implement the complete list is the execution authorization; no repeated design approval is needed.

Implementation, local validation and independent review complete. Task 6 release gates continue through GitHub and Sites; the local release ledger records their final IDs.
