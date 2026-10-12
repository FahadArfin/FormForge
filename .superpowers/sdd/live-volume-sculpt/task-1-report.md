# Task 1 implementation report

Implemented the live volume sculpt path in the isolated codex/live-volume-sculpt branch. Controller owns overall suite, production build, browser/runtime checks, benchmark and integration. No servers, browser sessions, push, merge or publication were started by this implementer.

## Production changes

- `geometry.worker.ts` exports `VolumeEvaluator`. Worker owns a single persistent evaluator, retaining only one final Manifold solid, one base signature, and the exact previous stroke signatures. Cold `evaluate(document)` remains stateless and has its original one-argument signature.
- Exact base compatibility includes project ID and full resolved node contents. Every earlier stroke must compare exactly and remain in order; shortened prefixes, changed radius/position/mode, edited nodes, or another project rebuild. No revision/ID-only shortcuts. Tessellation remains sphere(radius, 28), including original inflate radius behavior.
- Retained solid is the result of all volume booleans before legacy vertex deformation. Legacy smooth/pinch/flatten is applied fresh to each returned mesh in its original ordering. Sphere source handles and translated brushes are explicitly deleted. Errors release the currently owned solid and invalidate cache. Dispose during module await rejects cancelled work and clears eventual allocation; overlapping evaluator calls are rejected.
- Automatic volume stamps start evaluation after a bounded 32 ms window, preserve useful active work, and coalesce to the latest document through the store rather than accumulating worker jobs. A compatible completed prefix updates visible mesh and records its own `meshDocument`; status stays `building`, analysis is null until caught up, and another latest evaluation starts without pointer-up.
- Unrelated edits retain the existing 90 ms debounce. Generation changes immediately invalidate obsolete live work on non-volume changes, undo/project/base edits, manual mode or cancellation. Explicit rebuild retains replacement semantics. GeometryClient public contract is unchanged, including timeout/cancel/cache bounds.
- `isVolumeContinuation(previous, next)` in `lib/volumeContinuation.ts` is shared with Viewport to allow new volume gestures against a proven prefix in automatic mode. Measurement/export freshness checks remain exact-current. Polygon sculpt semantics are unchanged.
- Store remembers the last document produced by the current gesture; a no-history continuation after undo or another document edit is rejected. New gestures still create their own history entry, mirrored stamps remain part of that entry.

## Exact benchmark API

```ts
import { evaluate, VolumeEvaluator } from '../apps/web/src/geometry/geometry.worker'
const evaluator = new VolumeEvaluator()
try {
  const mesh = await evaluator.evaluate(document) // sequential calls only
  const { reused, appliedStamps } = evaluator.lastEvaluation
} finally {
  evaluator.dispose()
}
const reference = await evaluate(document) // always cold/stateless
```

`dispose()` releases cache and invalidates any awaiting evaluation; subsequent sequential use is allowed. `clear()` is internal cache invalidation without cancellation-generation changes. `lastEvaluation.appliedStamps` counts actual new sphere boolean operations; `reused` reports exact retained-solid prefix reuse. No timing assertions are used to prove skipped work.

## Tests and red/green evidence

- 12:34:22 real WASM test red: VolumeEvaluator absent (`not a constructor`). 12:34:43 green after evaluator implementation. Alternating add/carve prefixes compare incremental and cold volume/triangle count; each appended request reports exactly one actual new stamp. Edited radius forces all stamps to rebuild.
- 12:35:08 controlled real-store transport test red: after 40 ms no request existed, confirming trailing debounce starvation. 12:36:11 green: held movement does not add/cancel active requests; older valid prefix displays as building with its own document; latest catches up without further input.
- Real WASM additional regressions cover changed position with reused IDs/revision, changed nodes, prefix shortening, project ID changes, legacy deformations (exact positions/indices comparison), empty base, invalid mechanical feature errors and subsequent recovery.
- Controlled transport additional regressions cover undo, project switch, base edit, manual mode and cancel while result is pending. Old results are rejected. Quick successive mirrored gestures remain separate undo entries and redo restores the prior gesture.
- 12:38:00 held gesture across undo red: continuation incorrectly created a stroke on restored document. 12:38:21 green after store gesture snapshot guard.
- 12:38:44 disposal during initialization red: cancelled work resolved. Added generation guard; initial implementation incorrectly treated ordinary cache invalidation as cancellation (caught by focused tests and controller benchmark). Corrected `clear()` vs `dispose()` separation. 12:39:23 final focused run green: 4 files, 48 tests.

Final commands:

- `npm.cmd test --workspace @formforge/web -- src/store/liveVolume.test.ts src/geometry/liveVolume.test.ts src/store/editor.test.ts src/geometry/client.test.ts`: 4 files, 48 tests passed.
- `npm.cmd run typecheck --workspace @formforge/web`: exit 0.
- `git diff --check`: exit 0.

## Limits and concerns

- Genuine boolean operations remain synchronous WASM operations. A particularly expensive prefix still must complete or hit existing worker timeout; this change removes replay and starvation but does not promise a fixed frame rate for all solids.
- Full-prefix JSON comparisons are linear in document/stroke size; only one prefix history is retained. No geometry fidelity is lowered.
- No browser acceptance or overall-suite success is claimed here. Controller benchmark provisionally reported roughly 7.2x total improvement on its 80-stamp fixture before the final lifecycle checks; controller reruns against final immutable commit.
- Controller's plan, e2e file and benchmark script are deliberately excluded from this implementation commit.

## Commit

Code/tests commit recorded below by the implementer after verification; report included with that commit.

Verified code/tests commit: 336185b (feat: incrementally evaluate live volume sculpt prefixes). This report-only follow-up records its immutable identifier.
