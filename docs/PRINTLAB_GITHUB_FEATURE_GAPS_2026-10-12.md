# PrintLab GitHub feature-gap research — 2026-10-12

## Purpose and method
Extend the existing browser studio with useful missing workflows from established open-source CAD and model-viewing projects. This is source/documentation research against PrintLab commit ac4fa79, not hands-on certification of competing products. User requested research, a missing-feature list, and implementation of all selected features. Retain local-first editing, project compatibility, preview/Apply, undo, and current appearance (palette selection is pending).

## References
- [FreeCAD](https://github.com/FreeCAD/FreeCAD): repository displayed approximately 34.2k stars at research time; constrained sketches, parametric history and drawings. [SVG drawing export](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/TechDraw_ExportPageSVG.md), [DXF drawing export](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/TechDraw_ExportPageDXF.md), [assembly BOM](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Assembly_CreateBom.md).
- [OpenSCAD](https://github.com/openscad/openscad): approximately 10.4k stars; code-first parameterized CAD. [Parameter-set reader/writer](https://github.com/openscad/openscad/blob/master/src/core/customizer/ParameterSet.cc) persists named presets as JSON.
- [JSCAD](https://github.com/jscad/OpenJSCAD.org): approximately 3.3k stars; browser/CLI modular parametric CAD with reusable parameter controls and 2D/3D exchange. [Modeling documentation](https://github.com/jscad/OpenJSCAD.org/blob/master/jsdoc/tutorials/02_modelingBasics.md).
- [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer): established browser model viewer; its [format list](https://github.com/kovacsv/Online3DViewer/blob/master/README.md) includes PLY and OFF import/export alongside STEP/IGES and other formats.
- [SolveSpace](https://github.com/solvespace/solvespace): parametric 2D/3D CAD, with a documented constraint solver and vector drawing export ([features](https://solvespace.com/features.pl)).
- [GridSpace](https://github.com/GridSpace/grid-apps): approximately 917 stars; browser slicer and mesh editor. Its slicing engine is a substantive subsystem, not a time-estimate formula.

Stars are approximate time-specific discovery signals, not quality scores. No external implementation code is copied or vendored; source projects have differing licenses.

## Already present — do not duplicate
Primitives, booleans, sketches/extrude/revolve, parameter formulas, variants with comparison and batch model export, workplanes, image tracing, editable part insertion, linear/circular assembly patterns, section inspection, distance/angle/circle measurements, named selections and camera views, Mesh Doctor, part properties, precision transforms, undo/redo/checkpoints, STL/OBJ/3MF/GLB exchange, print profiles, slicer metadata import, local persistence, cloud review, and structured AI plans.

## Missing features selected for implementation — all six
| ID | Gap and reference | PrintLab solution | Acceptance |
|---|---|---|---|
| F1 | PLY geometry exchange (Online 3D Viewer) | Bounded PLY mesh import through existing unit/placement review; evaluated PLY export through Export. | Known geometry round trip, malformed/oversized rejection; explicit geometry-only/unit caveat. |
| F2 | OFF geometry exchange (Online 3D Viewer/OpenSCAD) | Bounded OFF mesh import and evaluated OFF export. | Validate counts, indices and finite coordinates; supported polygons triangulate correctly or reject explicitly; round trip. |
| F3 | Portable section drawings in SVG (FreeCAD/SolveSpace) | Evaluate a captured model snapshot, intersect an axis-aligned plane, preview 2D section linework and download SVG with physical mm sizing. | Correct known cube/tube sections, coordinate mapping, empty/tangent/coplanar behavior, safe names, stale/cancel handling. |
| F4 | Section drawing exchange in DXF (FreeCAD/SolveSpace) | Export the same reviewed section segments as DXF with explicit millimeter units. | Numeric drawing coordinates and unit header; no promise of exact BRep curves or automatic toolpaths. |
| F5 | Editable-assembly parts list (FreeCAD BOM) | Derive a local component inventory from complete assembly/boolean groups, list source names, materials and feature counts, download CSV/JSON. | Suppressed geometry excluded, cutters not counted as purchased parts, no inferred SKU/mass/cost; correct grouping and CSV safety. |
| F6 | Portable parameter presets (OpenSCAD) | Versioned PrintLab parameter-preset JSON import/export, matching target parameters by name/unit with fresh variant IDs and preserved formulas. Preview new presets, then atomically add them in one undo step. | Reject missing/extra/mismatched parameters, cycles, duplicate names, oversized input and stale review; persisted variants retain existing Apply workflow. |

F3/F4 are tessellated section drawings, not full associative production drawing sheets. F5 is an assembly inventory, not a purchasing BOM: user part numbers, vendors, exact component mass and pricing are not inferred. F6 is PrintLab preset exchange, not arbitrary OpenSCAD program execution.

## Larger remaining differences
Full nonlinear sketch constraint solving, persistent BRep face/edge identity and arbitrary fillets/shells, STEP/IGES solid editing, kinematic assembly mates, full associative drawing sheets, native slicing/CAM, and simultaneous collaborative editing remain separate architecture tracks. This release does not claim full feature parity with desktop CAD or that these larger gaps are implemented. Preserve these limitations explicitly rather than disguising partial substitutes.

## Architecture and validation
Reuse Three.js geometry, the existing isolated evaluation worker, schema validators, native dialogs, local save system, export scope checks and document transactions. No new hosted services, credentials, CAD kernel or changed storage identifiers. New controls use existing theme tokens, responsive dialogs and command discovery. Run baseline and final unit tests, types, production build, bundle budget, desktop/phone browser cases and independent review. Physical printing and exact manufacturing performance remain unverified.

## Implemented behavior and limits
- F1/F2: ASCII PLY 1.0 and plain OFF triangle meshes. Binary PLY, nontriangle faces and extended OFF return explicit unsupported errors. Counts, indices and coordinate values are bounded before geometry creation. Extra scalar PLY vertex attributes are validated but discarded. Existing import review controls units and placement; exports use evaluated geometry in millimeters.
- F3/F4: a cancellable evaluated-snapshot preview produces axis-aligned section linework. Limit 100,000 triangles, 300,000 vertices and 50,000 segments; 0.000001 mm tolerance. Coplanar faces retain perimeter edges; point tangencies emit no segment. SVG has a 0.5 mm border and physical mm sizing; DXF uses LINE entities and INSUNITS=4. Document, plane or placement changes invalidate the preview.
- F5: active source components follow connected assembly/boolean/attached-feature relationships. Suppressed features are excluded from counts while their relationships preserve complete component selection. Cut-only components become unassigned tools. Exports whitelist inventory metadata and escape spreadsheet formulas. Site tools return at most 200 component rows with explicit truncation; UI downloads retain the full scope.
- F6: strict version-1 PrintLab preset JSON, max 1 MiB / 24 saved variants / 256 parameters. Exact parameter names and units map to target IDs; imported variants get fresh IDs. Formulas, bindings, dimensions and conservative geometry/transform limits are checked. Large unused finite parameters remain valid; bound values above 10,000,000 target units and geometry outside the supported conservative 10 km envelope reject. This conservative envelope can reject a near-limit shape even if a particular rotation fits. Preview is invalidated by edits, including edit then undo. Adding presets changes saved variant metadata in one undoable transaction; applying them is a separate existing action.

## Review evidence
Independent implementation reviews covered file parsing and allocation limits, geometry intersections, asynchronous stale-state races, inventory grouping, CSV safety, formula validation and cross-feature integration. Fixed findings: inventory selection retaining mesh subcomponent selections; selected suppressed cutters losing their active component; extreme preset bindings overflowing geometry; command discovery not focusing a directly targeted button. These have regression coverage. No new dependencies or external implementation code were introduced.

## Local acceptance results
- Baseline: 630 tests. Final unit/API suite: 742 passed (49 model, 667 web, 26 API).
- Type checks and production Worker build passed. All 84 packaged public assets verified. Entry payload: 218,323 bytes raw / 69,767 gzip, under 307,200 / 102,400 budgets. Existing Manifold externalization/module warnings and the studio chunk-size advisory remain; entry budget passes.
- Full browser suite: 49 passed, one desktop-inapplicable skip. After the final command-focus correction, all 21 affected desktop/phone workflow/accessibility cases passed with the same one inapplicable skip. New cases exercise mesh export/reimport with unit review; actual SVG/DXF downloads; inventory CSV/JSON and selection; preset review, apply, undo and reload.
- Codex browser: visible washer section preview; saved project restored; phone preset command focus and Enter activation; actual WebMCP discovery, valid inventory read, and invalid-input error with unchanged model. No production deployment claim is made by these local checks; release must pass GitHub CI and verify the deployed artifact separately.
