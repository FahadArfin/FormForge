# PrintLab studio feature gaps implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Implement all six selected missing workflows from the GitHub research without replacing the existing editor.
**Architecture:** Bounded pure exchange/inspection helpers; existing import/export dialogs and snapshot evaluation. UI changes remain within the current design system.
**Tech Stack:** React, TypeScript, Three.js, Manifold, Vitest, Playwright.
**Spec:** docs/PRINTLAB_GITHUB_FEATURE_GAPS_2026-10-12.md

## Global constraints
Preserve document schemas and storage identifiers unless explicitly necessary. No external code copying, new service or dependency. Geometry exchange is geometry-only; units are explicit. Preview import before mutation; apply once; reject stale state. All files and geometry have bounded sizes. No fabricated certification, cost, time or supplier metadata.

## Review focus
Malformed file counts before allocations; non-finite/invalid indices; formulas resolving to invalid dimensions; project changes during async work; compound/cutter grouping and misleading inventory semantics.

### Task 1: PLY/OFF exchange (F1/F2)
Files: new lib/meshExchange.ts and tests; importers.ts, exporters.ts, ExportDialog.tsx and all file-picker extension accept lists/help copy.
- [x] Write and run failing known-geometry, malformed/count/format and round-trip tests.
- [x] Implement bounded parsers/serializers, reusing validateImportMesh and existing import placement review. Support ASCII OFF and PLY; support binary PLY if safe with bounded header validation; explicit unsupported errors otherwise. Do not silently skip nontriangular faces or metadata promises.
- [x] Integrate both import and export in existing visible workflows; preserve independent snapshot export.
- [x] Focused tests, self-review; report exact boundaries.

### Task 2: Section drawings (F3/F4)
Files: new lib/sectionDrawing.ts and tests, components/SectionDrawingPanel.tsx and tests; SectionPanel.tsx entry point. Controller owns cadToolCatalog.ts.
- [x] Write failing cube/tube/axis/coplanar/empty and serializer tests.
- [x] Implement bounded tessellated section segments using plane/triangle intersections; consistent 2D mapping, deterministic deduplication, dimensions, SVG and DXF serialization. No false watertight/closed-loop claims.
- [x] Evaluate snapshot with cancellation; on-demand preview, invalidate on document/section changes, disable exports until current. Existing WorkspaceDialog/panel styling; SVG preview is geometry not illustration, sanitize text. UI error/empty/cancel states.
- [x] Focused tests and self-review.

### Task 3: Assembly inventory (F5)
Files: new lib/assemblyInventory.ts and tests; components/AssemblyInventoryPanel.tsx; Inspector.tsx and cadToolCatalog.ts controller-owned integration.
- [x] Failing tests for grouping, cutters, suppressed and material metadata, safe CSV and JSON.
- [x] Read-only derived component list based on completeSelection groups; include source feature identifiers/names, assigned material labels, quantity=one per component. Do not sum nominal stock into fabricated evaluated mass/volume. Ungrouped boolean interactions disclosed.
- [x] Download CSV/JSON with project/revision and inspect/select complete component; selection isn't document mutation. Responsive details and scrollable table.
- [x] Focused tests and self-review.

### Task 4: Parameter-preset exchange (F6)
Files: new lib/parameterPresetExchange.ts and tests; components/ParameterPresetExchange.tsx and tests; ParameterVariants.tsx integration.
- [x] Failing round-trip/remapping/formula/unit/malformed/limit/stale tests.
- [x] Strict versioned schema, 1MiB file limit, max24 variants/256parameters; match names/unit exactly, preserve expressions, validate parameter evaluation and bindings. Require saved variants to export. Fresh local variant IDs; no source project geometry or credentials.
- [x] File import preview listing proposed variants, explicit Add presets transaction; stale review clears; undo/redo/reload preserve imported variants.
- [x] Focused tests and self-review.

### Task 5: Integration, review and release validation
- [x] Review each deliverable and fix findings; update help and searchable command entries.
- [x] Add browser coverage for new end-to-end workflows on desktop/phone.
- [x] Run npm run check, npm test, npm run build, node scripts/check-entry-budget.mjs, npx playwright test.
- [ ] Independent complete-branch review; document actual results, all limits, and larger remaining gaps. Follow existing PR/CI/exact-artifact publication workflow when release is ready.
