# CAD toolkit validation — October 3, 2026

This release implements priorities 1–10 in [the researched roadmap](CAD_WORKFLOW_PRIORITIES.md). The CAD toolkit groups tasks into Create, Inspect, and Prepare. Parameter variants live in Pro → Params; selected-part export lives in the Export dialog.

## Automated checks

- `npm run check`: passed across model, web, and API packages.
- `npm test`: **256 passing tests** (40 model, 216 web; 36 test files).
- `npm run build`: passed for all packages and generated the production website.
- Independent reviews covered geometry transforms, recipe subtraction, split topology, parameter restoration, and asynchronous export cancellation.

Regression coverage includes real Manifold compound rotation and signed-scale bounds, mirrored 3MF winding, deformation bounds, rigid grouped/sculpted placement, volume-conserving capped splits, unit operand order, invalid expression recovery, legacy project compatibility, parameter variant diagnostics, and stale export/split operations. Selected export component tests prove that the isolated result is downloaded, complete explicit groups are included, unrelated nodes are excluded, and editable backups remain complete projects.

## Browser acceptance

Tested the production build locally in the Codex browser, using a new project named **CAD toolkit · release check**. Existing projects were preserved.

| Workflow | Observed result |
| --- | --- |
| Precision input | `2 + 1 in` became 27.4 mm; `2 in` became 50.8 mm. |
| Vertex measurement | Two box corners measured **50.800 mm**, ΔX 50.800, ΔY 0, ΔZ 0. |
| Hole builder | Counterbore created two editable cutters and subtracted from the box. |
| Fit coupon | Five holes with 0.1–0.5 mm diametral clearances and a separate 4 mm gauge were added beside the model. |
| Plate placement | Whole model centered and dropped together; relative part positions and overall dimensions were preserved. |
| Section view | X-plane clipping and side flip exposed the interior without changing feature count or dimensions. |
| Planar split | Two closed mesh parts replaced the evaluated box/counterbore; one Undo restored all three editable source nodes. |
| Parameter variants | Compact and Wide restored bound values; overall width changed between 50.8 and 72.6 mm and restored correctly. |
| Selected export | Selected scope evaluated and displayed “Download requested” without an error. Browser file-save completion was not independently observed. |
| Narrow layout | At 390 × 844, toolkit navigation, placement, and split controls remained accessible; document scroll width equaled viewport width. |

Evidence: [measurement](cad-toolkit-2026-10-03/measurement.png), [section](cad-toolkit-2026-10-03/section.png), [variants](cad-toolkit-2026-10-03/variants.png), [selected export](cad-toolkit-2026-10-03/selected-export.png), [coupon](cad-toolkit-2026-10-03/coupon.png), [mobile](cad-toolkit-2026-10-03/mobile.png).

## Boundaries and remaining work

- Section view is visual clipping, without a cap. Planar splitting creates closed caps but bakes editable shapes, bindings, and material assignments into mesh parts; Undo restores them.
- Measurements use actual mesh surfaces/vertices, not persistent analytic CAD references.
- Fit recipes require physical calibration. No printer/material fit or fastener standard is claimed.
- Unsupported partial operations involving global sculpt strokes fail visibly. Locked shapes are protected.
- Physical print trials, slicer import, native touch-device testing, large-model benchmarks, and user studies were not performed. A 9/10 usability score or adoption by thousands cannot be established by these checks.
- The build retains its existing large-main-bundle advisory and Manifold browser-externalization warnings. Production generation and exercised worker operations succeeded.
- Workplanes, place-on-face, editable text, calibrated image tracing, cross-project parts, advanced shell/fillet, and other priorities beyond the first ten remain roadmap items.

## Release procedure

Use `codex/cad-workflow-toolkit`, push every commit for the Validate FormForge pipeline, open and merge a pull request after validation, and publish the exact successful main pipeline artifact to the existing public FormForge Site. GitHub records and the Sites deployment record are the authoritative release status; this file records local acceptance before that release.
