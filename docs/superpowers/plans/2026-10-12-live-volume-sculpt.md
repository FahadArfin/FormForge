# Live volume sculpt implementation plan

> For agentic workers: use superpowers:subagent-driven-development and TDD for the implementation task.

Goal: Volume add and Volume carve update the actual visible solid continuously while dragging instead of waiting for pointer movement to stop, without degrading saved/export geometry.
Architecture: Retain the previous evaluated Manifold solid inside the geometry worker and apply only new, ordered volume stamps when the base geometry and full prior stroke prefix match exactly. Replace the volume-stroke trailing debounce/restart behavior with bounded continuous updates, latest-work coalescing and progressive valid-prefix mesh delivery. Reuse the existing Manifold engine, editable stroke documents and viewport.
Tech stack: TypeScript, Zustand, Three.js, Manifold WASM, Vitest and existing Playwright tests.
Spec: user request and design below in this document. Explicit user authorization to research and implement applies; no new approval gate.

## Global constraints
Preserve model schemas, file/storage formats, brush semantics, exact sphere detail, operation order, symmetry, one undo step per gesture, redo, save/recovery and export freshness checks. Do not substitute a decorative preview for genuine carve/add geometry. Keep worker cancellation/timeout and bounded memory. Do not lower geometry fidelity silently or add dependencies. Manual-build mode remains explicitly manual. Never present an older prefix as the final current document mesh. Never accept stale results from another project, undo branch or changed base nodes. No unrelated UI changes. Use existing isolated worktree and branch; no subagents from implementer, no push/merge/publish by implementer.

## Review focus
- Sequential add/carve alternation and editing a previous stroke must invalidate unsafe reuse.
- Worker errors/cancel/manual mode and switching documents while a live result is pending must not leak WASM allocations or overwrite current geometry.
- A newer stroke arrives before a previous result: show valid progress without setting meshDocument to the newest document, and eventually finish that newest document without pointer-up input.
- Quick successive gestures preserve one undo entry per gesture and do not join across canceled/changed documents.
- Large meshes and long strokes remain bounded: no unbounded per-stamp worker queue or retained cache history.

### Task 1: Implement incremental live volume sculpting
Files to inspect/modify: apps/web/src/geometry/geometry.worker.ts (extract focused evaluator/cache helper if needed), apps/web/src/geometry/client.ts only if necessary, apps/web/src/store/editor.ts, apps/web/src/components/Viewport.tsx, focused helper(s) and real regression tests. Do not edit controller benchmark .audit/volume-sculpt/volumeBenchmark.test.ts or e2e files; controller owns browser validation.
Interfaces: preserve evaluate(document) for existing isolated callers. Expose a clearly owned optional evaluator/cache if tests and worker need incremental lifetime; report its exact API so controller can use the same production path in benchmark. Default stateless evaluation remains valid reference. Worker uses persistent cache; disposal/invalidation explicit. Store and Viewport share a helper/guard for safe volume-prefix continuation if needed. Keep the existing GeometryClient public contract unless a minimal new option is required.

- [x] Write failing tests proving continuous movement no longer starves mesh updates; queued later stamps do not cancel useful in-flight prefix work; current mesh catches up; stale/undo/project/base changes and cancellation remain safe; new gestures and symmetry keep history semantics. Tests must exercise real store logic, with a controlled geometry transport only for asynchronous ordering.
- [x] Add real-WASM equivalence and invalidation tests covering add/carve order, long stroke prefixes, changed radius/position with reused IDs/revision, changed nodes, undo/redo prefix shortening, errors, empty base, and legacy deform strokes. Prove incremental path actually skips previous boolean work with meaningful operation evidence, not brittle timing thresholds.
- [x] Implement bounded cache of previous solid, precise input/prefix compatibility, and safe ownership/disposal. Use installed Manifold API; do not assume alpha APIs. Keep sphere tessellation and legacy deformation ordering unchanged. One cache, no per-stamp history retention. Changed earlier geometry must fully rebuild.
- [x] Implement bounded live scheduling for add/carve (inflate if existing compatible fallback) with coalesced latest snapshot, no repeated terminate/reinit while appending, and progressive valid-prefix geometry. Final result and analysis must correspond to final document. Preserve existing general debounce for unrelated edits and manual build behavior. Independent user rebuild/cancel must still work. Avoid gating every next volume gesture on the final mesh if the visible mesh is a proven compatible prefix in automatic mode; unsafe stale meshes still block.
- [x] Add concise user-facing guidance only if needed, with honest finalizing/busy state for genuinely expensive solids. Ensure volume tools show the actual solid in viewport; no lower-fidelity display-only carve trick.
- [x] Run focused tests and typecheck, self-review and commit code/tests. Report real red/green evidence, public helper API, limitations and commit(s) in .superpowers/sdd/live-volume-sculpt/task-1-report.md. Do not run full build/browser or start servers; controller owns those.

### Task 2: Controller performance, browser validation and release
Baseline benchmark: .audit/volume-sculpt/baseline.json; current fresh replay: 80 stamps in batches of4, 20 updates total1969.6ms, median101.9ms, last187.9ms. Use same fixture with production incremental path; report improvements as measured machine/fixture results, no universal FPS promise. Baseline existing release d14fbcdb80b2324e50adb73d78eca9de7013aa57 already passed773 tests and63 browser checks earlier this session.
- [ ] Independent implementation/whole-branch review after changes; fix actionable findings.
- [ ] Add real pointer browser regression proving add and carve visible mesh update before mouse release, final readiness, undo/redo, render geometry and persistence roundtrip; desktop and touch where supported. Inspect representative local and live UI with CUA. Controller can write test fixtures; avoid altering user's actual project.
- [ ] Run all tests/check/build/budget and existing browser suites. PR + passing CI + exact-head merge + publish exact validated build to existing public Site; verify live bytes/auth/navigation and current volume tool behavior. Preserve URL and audience.

## Research
Primary references inspected: https://manifoldcad.org/docs/html/classmanifold_1_1_manifold.html (boolean/batch operations and manifold validity); https://manifoldcad.org/jsdocs/ (deferred operations and geometry semantics); https://github.com/stephomi/sculptgl and https://github.com/stephomi/nomad-manual/blob/main/docs/topology.md (localized adaptive sculpting alternative); https://threejs.org/docs/pages/BufferAttribute.html (GPU attribute updates). Decision: retain exact existing CSG sphere brushes; adaptive polygon/voxel conversion would change topology/semantics and is not required to remove debounce starvation and repeated history replay. Batch unions only if they preserve sequential mixed-mode semantics; incremental ordered operations preferred.

## Implementation and measured validation

Implemented a persistent worker-owned VolumeEvaluator, bounded live scheduling and exact-prefix viewport updates. The cache retains one pre-deformation solid and only processes appended stamps. Changed bases, changed prior strokes, undo branches, project changes and cancellation invalidate unsafe work. Original brush fidelity, saved stroke format and final export freshness remain intact. Imported mesh identity fast paths avoid serializing unchanged vertex arrays on each input event.

Local validation at implementation 88b1ef3: 786 model/web/API tests, type checks, production build and entry budget pass. Desktop and phone-layout browser regressions verify actual worker responses and matching WebGL draws while the pointer is held, add/carve volume direction, undo/redo and saved reload. Phone layout uses mouse input emulation; physical touch hardware is not claimed. The prior build failed the held-pointer progress assertion. Existing navigation integration tests now wait for rendered destinations rather than fixed delays under parallel CPU load.

The reproducible manual benchmark is scripts/volume-sculpt-benchmark.test.ts. On this machine, 80 ordered add/carve stamps over 20 updates on a 200 x 120 x 4 mm plate took 1957 ms with full replay versus 271 ms incrementally (7.2x less total evaluation time); median update 103 ms versus 13 ms, final update 183 ms versus 15 ms. Both final volumes matched to six decimals. This is CPU/WASM evaluation only, excludes rendering/input overhead, and is not a guaranteed frame rate. Growing CSG complexity, imported-mesh size and device speed still affect responsiveness.

Release gates remain GitHub CI, full browser regression, exact validated artifact publication and live asset/brush verification; release results are recorded in the pull request and task evidence.
