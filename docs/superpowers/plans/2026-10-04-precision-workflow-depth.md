# Precision workflow depth implementation plan

**Goal:** Help beginner and semi-professional makers understand dependencies, produce size families, revisit inspections and hand off printable pieces.
**Architecture:** Extend existing parameters, variants, camera bookmarks and export pipelines. Keep document changes atomic and undoable; keep inspection state and export jobs separate from geometry.
**Tech stack:** Existing React/TypeScript, Zustand, Three.js, Manifold workers, fflate, Vitest and browser CI. No new product dependencies.
**Spec:** The five-priority design presented in this chat, grounded in the current audit and official competitor documentation. The user authorizes research, implementation, feature branches, CI, PR merge and public Sites release.

## Global constraints

- Work on `codex/precision-workflow-depth`, preserve old projects and all existing workflows.
- Root owns source, code integration and release. Delegation is read-only research/review.
- Every commit is pushed for CI. Merge green; publish the exact successful main artifact to the existing public Site.
- Existing camera-only bookmarks remain usable. View/selection recall must never modify geometry.
- Batch exports use captured documents, sequential evaluation, cancellation, at most eight variants and a 64 MiB raw package cap. Never download partial success as complete.
- A parts package accepts at most 64 connected shells / 100,000 triangles. Reject nonpositive cavity shells rather than exporting cavities as parts. Parts are evaluated geometry, not source features or inferred identical quantities.
- Keep physical print verification, slicer profiles and general STEP/BRep claims out of this release.

## Review focus

1. Renaming `width` must not change `wall_width`, numeric exponents or unrelated IDs; template customization and saved variants remain linked.
2. Old projects, deleted/locked/suppressed selection members and camera-only bookmarks must degrade visibly and safely.
3. Camera projection changes retain framing, picking, transform controls and resize behavior on phone and desktop.
4. Closing dialogs, switching projects or cancelling jobs must invalidate asynchronous results and downloads.
5. Cavities, invalid geometry, unit mismatches, duplicate names and malicious CSV prefixes must not corrupt outputs or user data.

## Tasks

- [x] 1. Parameter safety and readability. Add token-aware reference rename in model parameters; add usage lookup and atomic rename/remove helpers; update store and Parameters UI. Resolve semantic template fields through their stable recipe IDs, including generated bindings. Test partial identifiers, exponents, collisions, variant formulas, template resize after rename and Undo. Use existing theme tokens and readable field labels.
- [x] 2. Variant manager. Add immutable rename/update/comparison helpers, a responsive comparison dialog and CSV export. Add sequential variant ZIP export with resolved parameters, geometry and per-variant print reports, progress/cancel and document-change rejection. Test failed variants, cancellation, limits, filenames and preserved active document.
- [x] 3. Inspection views. Add orthographic/perspective camera utilities and a display toggle; extend bookmark schema with optional projection/frustum and section/display/focus settings. Restore only valid IDs and preserve camera-only legacy behavior. Test screen-scale equivalence, resize/framing, schema bounds and saved state; inspect both projections in the browser.
- [x] 4. Selection sets. Add optional validated document sets (24 sets, 256 IDs each), create/rename/update/remove/recall helpers and dialog. Expose via Model, Display and command search. Report missing members and respect locks/suppression; removing a set never removes shapes. Test round trips and group/attachment selection expansion.
- [x] 5. Parts package. Evaluate the existing export scope and split final geometry in a cancellable worker. Provide per-part preview, dimensions, geometric volume, CSV manifest and ZIP of separate STL/3MF solids. Preserve cuts; reject cavity shells and oversized jobs. Test real Boolean geometry, deterministic ordering, volume conservation and cancellation.
- [x] 6. Integration and release preparation. Add searchable task entries for new flows, browser journeys for rename/variants/bookmarks/sets/packages, visual desktop/phone evidence and a research/release guide. Run unit/type/build/budget checks, one independent branch review, GitHub CI/PR/main and public exact-artifact verification.

## Research and current audit

- Current screenshots: `.audit/competitive-v7/01-studio-before.png`, `02-parameters-before.png`, `03-views-before.png`. The studio has a clear canvas and template guide; Parameters uses cramped hard-coded dark cards in light mode; saved views retain only camera pose; variants have only Save/Apply/Remove.
- [Shapr3D variables and reference updates](https://support.shapr3d.com/hc/en-us/articles/18320182069916-Variables-and-expressions)
- [Onshape configuration tables](https://cad.onshape.com/help/Content/PartStudio/managing_configurations.htm)
- [Shapr3D inspection view persistence](https://support.shapr3d.com/hc/en-us/articles/26653091404316-26-80-Decals-in-Visualization)
- [Fusion selection sets](https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-CREATE-SELECTION-SETS.htm)
- [Blender viewport projection](https://docs.blender.org/manual/en/latest/editors/3dview/navigate/projections.html)
- [Shapr3D ZIP export](https://support.shapr3d.com/hc/en-us/articles/7874524196764-Export)
- [Prusa model export](https://help.prusa3d.com/article/export_1771)
- [Onshape parts/BOM](https://cad.onshape.com/help/Content/Assembly/bill_of_material.htm)

Competitor documentation is research, not a hands-on competitor audit. The combined variant package and connected-solid manifest are FormForge design decisions.

Release gate: local checks, browser journeys, independent review and visual evidence are complete before committing. GitHub CI, PR merge and the exact-artifact public deployment are tracked in the PR and final handoff.
