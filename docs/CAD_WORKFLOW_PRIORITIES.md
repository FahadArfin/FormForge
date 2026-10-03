# CAD workflow priorities — October 3, 2026

This roadmap targets beginners and intermediate makers designing functional printed parts. Priority reflects frequency, avoided mistakes, feasibility in the existing mesh kernel, and dependencies. It is an expert assessment, not measured customer demand.

## This release, in implementation order

1. **Geometry reliability.** Preview and evaluated/exported solids must use the same compound rotation and signed-scale convention. Protect world-space sculpt operations from unsupported transforms.
2. **Precision input.** Arithmetic, parentheses, and explicit mm/cm/m/in lengths in dimensional inputs; keep canonical geometry in millimeters. Invalid expressions must explain the error and never change the model. Do not toggle document units while some editors only relabel values.
3. **Editable hole builder.** Plain hole, counterbore, countersink, elongated slot, and hex nut pocket with custom dimensions and explicit diametral clearance. Ordinary editable cutter nodes, bounded inputs, one undo transaction. No unverified standards presets.
4. **Measurement improvements.** Surface/vertex modes, actual evaluated-result picking, distance plus absolute X/Y/Z deltas. Clear readings on geometry changes rather than displaying stale dimensions. Mesh vertices are tessellation points, not analytic CAD references.
5. **Fit-test coupons.** Editable pin/hole clearance strips with bounded sample count, clear left-to-right labels and diameter-clearance semantics. Print a separate gauge and test fit; no universal clearance promise.
6. **Rigid plate placement.** Center/drop a selection as an assembly or the whole document without flattening relative part positions. Complete groups, respect locks, and translate whole-document sculpt centers with the model. Reject unsupported partial sculpt operations.
7. **Section inspection.** Transient X/Y/Z clipping with offset and side flip, consistent visible geometry and picking. It does not change saved/exported geometry and is not a capped solid cut.
8. **Planar splitting.** Split the current evaluated model at an axis-aligned plane into closed meshes, keeping both/either half; atomic undo and asynchronous stale-document protection. Explain that the result bakes editable source history; retain recovery through undo/checkpoints. Refuse locked model replacement and empty halves.
9. **Parameter variants.** Named, bounded parameter snapshots stored in the project; apply validated values as one undoable change, show when current parameters differ, reject missing/renamed parameter conflicts. Existing checkpoints remain full model recovery.
10. **Selected-part export.** Include complete explicit Boolean groups, exclude unrelated parts, reject cutter-only selections and partial global-sculpt ambiguity. Evaluate in a separate worker so exporting cannot cancel editor builds. Export scope is explicit and never changes the source document.

## Existing tools to preserve

Primitives, sketches and constraints, extrude/revolve, fixed lofts, named parameter formulas, linear/polar patterns, alignment/distribution, mesh cleanup and component editing, polygon/volume sculpting, project checkpoints, local projects, STL/OBJ/3MF/GLB export, import, and print-size checks.

## Next priorities — implemented in this continuation

11. Workplanes (XY/XZ/YZ plus offset, then picked planar faces).
12. Place a picked face on the plate; preserve assembly transforms.
13. Editable planar emboss/deboss text with licensed fonts and bounded complexity.
14. Calibrated local image underlays for tracing replacement parts.
15. Insert reusable editable parts from other local projects, with ID/parameter remapping.
16. Contact alignment with a specified gap, multi-part patterns, and explicit pattern origins.
17. Configurable enclosures/lids/bosses, brackets, adapters, and snap-fit calibration sets.
18. Pinned measurements, three-point angles, and dimension annotations with stale-reference handling.
19. Printer/material profiles and honest material/cost estimates; actual slicer integration if a supported path is available.
20. Shared projects, accounts, collaborative review, accessible tutorials, and onboarding task analytics with explicit privacy choices.

The implementation and limits are documented in [the workflow guide](CAD_NEXT_WORKFLOW_GUIDE.md). Priority 19 uses model export and entered slicer results for handoff; FormForge does not generate G-code or estimate slicing time. Priority 20 uses ChatGPT sign-in, private cloud snapshots, revocable review links, and snapshot-specific discussions, rather than simultaneous editing.

## Advanced modeling roadmap

True edge fillet/chamfer and constant-thickness shell; persistent face/edge references; robust multi-loop sketches and constraint solving; associative patterns; sweep and guide-rail loft; verified threads and involute gears; STEP/BRep exchange; assembly mates/collision checking; local wall-thickness analysis; large-mesh performance and cancellable job queues. These require kernel/data-model work and dedicated numerical validation. The existing Hollow modifier scales an inner copy and must not be described as a constant-wall shell.

## Research

- [Onshape hole tool](https://cad.onshape.com/help/Content/PartStudio/hole.htm): purpose-built holes reduce repetitive cutter construction.
- [Shapr3D measurement](https://support.shapr3d.com/hc/en-us/articles/7874465678236-Measure): axis distances and persistent measurements support precise modeling.
- [Prusa modeling guidance](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135): orientation and fit must account for printing conditions.
- [Prusa place on face](https://help.prusa3d.com/article/place-on-face-tool_1781) and [cut tool](https://help.prusa3d.com/article/cut-tool_1779): orientation and splitting are common preparation tasks.
- [Shapr3D section view](https://support.shapr3d.com/hc/en-us/articles/7873938030492-Section-View) and [construction planes](https://support.shapr3d.com/hc/en-us/articles/7874364567452-Construction-Plane): internal inspection and local modeling frames.
- [Prusa text](https://help.prusa3d.com/article/text-tool_399460), [Shapr3D import](https://support.shapr3d.com/hc/en-us/articles/7874501645724-Import), [Onshape configurations](https://cad.onshape.com/help/Content/PartStudio/configurations.htm): practical labeling, tracing/reuse, and part families.

## Acceptance boundaries

Use a feature branch, meaningful regression tests, browser task checks, GitHub PR, validation on every pushed commit, and the exact validated build for public Sites. Automated geometry checks do not prove physical fit, manufacturing safety, formal accessibility compliance, or suitability for thousands of concurrent users. Preserve user projects during QA.
