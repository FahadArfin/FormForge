# FormForge priorities 4–8

## Delivered

| Priority | Result | Where to use it |
| --- | --- | --- |
| 4 — Responsiveness and recovery | Public entry loads separately from CAD. Workers start on demand, obsolete builds can be stopped, jobs time out after 60 seconds, and evaluated-mesh cache retention is capped at six snapshots / 64 MiB. Build status reports elapsed time. Three previous durable revisions are kept per project in the same save transaction. | Build progress → Stop; workshop or History → Recovery copies. Recovery opens a new project and also offers an editable download. |
| 5 — Direct precision | Select numbered sketch points or edges visually or by keyboard. Edit coordinates and edge lengths as drafts, then Apply or Reset. Length edits retain a distance rule. Constraints show affected references; redundant rules are distinguished from inconsistent ones. Hover and click use the same grid/axis snap. Selected object sizes are editable beside the canvas. | Select an extrude/revolve shape → Shape the outline; Sketch dimensions & rules; canvas → Size. |
| 6 — Print and fit | Current evaluated geometry can highlight downward slopes below the configured angle from the bed, with a matching export preview. Create a fit coupon, record a user-tested diameter clearance for an explicitly named printer/material/nozzle setup, and load it as a hole-builder draft. Invalid saved calibration data cannot silently overwrite existing results. | Print → Overhang guidance / Fit calibration; export preview; CAD toolkit → Hole builder. |
| 7 — Website and library | Public homepage, a real interactive washer demo, searchable/category-filtered library with eight editable recipes, geometry-derived illustrations, dimensions, editing steps and print notes. Template previews create a separate project after safe-save handling. | Home / Templates. Four existing recipes are expanded; coupon, washer, tray and cable plate are new library choices. |
| 8 — Access and phone review | Dialog descriptions and focus restoration; mobile drawers trap focus and make the background inert; clear close controls; larger targets and readable sketch panels; keyboard camera views/zoom and preview rotation controls; phone review/measure/share shortcuts. Measurement commits on a tap, not an orbit gesture. Reduced-motion styles are respected. | Studio, previews, dialogs and phone layout. |

## Validation

- `npm run check`: model, web, API and cloud types pass.
- `npm test`: 342 tests (42 model + 300 web) pass. Regressions cover transaction rollback, imported backups reusing metadata, recovery retention in Trash, lazy/cancelled/timed-out workers, byte cache accounting, constrained sketch draft/apply/reset, locked handles, pointer gestures, overhang fixtures, calibration validation/preservation, and actual template geometry.
- `npm run build`: production site and Cloud Worker build; packaged assets and anonymous cloud routing verified by the existing build check.
- Two independent read-only reviews completed; reported issues were fixed and targeted tests rerun.
- Desktop browser: real demo changed 30 → 40 mm; washer template created a new project; selected outer size changed 30 → 36 mm; a recovery copy restored the 30 mm revision as a new project; 60° input survived rebuild; sketch edge changed 10 → 12 mm through draft then Apply; ArrowRight on an SVG handle left model position unchanged.
- Phone viewport (390 × 844): public search and template card layout, accessible print drawer, reverse-tab wrap, inert background, Escape/focus return, and tap-vs-orbit measurement checked. Desktop viewport restored after testing.
- Browser testing found and fixed overlapping phone controls, unreadable legacy sketch styling, and duplicate material panels caused by colliding React keys.

## Performance evidence

The previous CI artifact at `8fe2950` has a 1,654,742-byte entry script (468,965 bytes gzip). This release's public entry and static JavaScript dependencies total about 207,800 bytes (66,300 gzip), approximately **86% less compressed JavaScript before opening CAD or the demo**. This is a transfer-size comparison, not a claim about real-user load time. CSS, images, browser cache and network conditions are excluded. CI now enforces a 300 KiB raw / 100 KiB gzip public JavaScript budget with `scripts/check-entry-budget.mjs`.

Run `node scripts/benchmark-geometry.mjs` for reproducible geometry fixtures. The checked-in [benchmark JSON](benchmarks/2026-10-03-geometry.json) records machine/runtime details. On the tested Ryzen 7 9800X3D, warm median kernel evaluation was 36 ms for the enclosure, 30 ms for the coupon, 88 ms for 20,480 triangles and 777 ms for 204,020 triangles. The last mesh's overhang scan took 16.5 ms. These are local Node executions of the same Manifold kernel, excluding browser rendering, worker transfer and phone hardware. They are not service load tests or field Core Web Vitals.

## Limits and follow-up evidence

- No physical parts were printed during this release. Every template explicitly says physical print testing is pending. Recorded fit results are user reports, not certification.
- Overhang analysis is a bounded geometric advisory (up to 500,000 triangles), measured from the horizontal bed. It excludes triangles entirely within 0.05 mm of Z=0; it does not infer supports under floating undersides. It does not simulate bridging, cooling, strength or local wall thickness. Inspect the slicer's layers and support preview. Local thin-wall analysis remains deferred until it can be validated.
- Recovery preserves successfully saved revisions on the same browser/device. Lifecycle save attempts cannot guarantee writes during browser or operating-system termination. Downloads/cloud snapshots remain separate backups.
- Keyboard controls cover selection, numeric edits, sketch references and camera alternatives; freehand sculpting still uses pointer gestures. Phone checks used a narrow browser viewport, not a physical-device accessibility certification.
- Large-model worker timeouts and cache limits bound common failure modes. This release does not establish capacity for thousands of simultaneous users; real-user performance and service load measurements remain separate work.

## Research used

- [Prusa: Modeling with 3D printing in mind](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135): test tolerances and consider orientation and print process.
- [Prusa: Support material](https://help.prusa3d.com/article/support-material_1698): overhang threshold convention measured from the horizontal plane.
- [WCAG 2.2 understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/): keyboard access, visible focus and target size inform the focused accessibility pass.
- [Web Vitals](https://web.dev/articles/vitals): distinguish shipped resource budgets and local timings from real-user experience measurements.

## Release path

Feature branch `codex/precision-print-workflow` → push validation → pull request checks → merge → main validation artifact → public Sites. Deploy the exact main CI artifact rather than rebuilding it locally. The pipeline runs on every pushed branch commit and pull request and retains the validated artifact.
