# FormForge: precision workflow release

The next useful investment was completing repeatable CAD work: understanding dependencies, evaluating several sizes, revisiting an inspection, selecting assemblies, and delivering separate printable solids. This release implements all five priorities identified in the current competitor review.

## Research and decisions

| Priority | Existing pain | Reference pattern | Implemented behavior |
| --- | --- | --- | --- |
| 1. Reliable parameters | Renaming could break links; deletion could leave dangling formulas; small dark fields were hard to read in light mode. | [Shapr3D variables](https://support.shapr3d.com/hc/en-us/articles/18320182069916-Variables-and-expressions) | Atomic token-aware rename across current expressions, shape bindings and saved variants. Used-by lists, guarded deletion, stable recipe IDs, readable themed fields. Editing a numeric value updates its literal expression. |
| 2. Useful configurations | Saved sizes could only be applied one at a time; differences and output files were hard to compare. | [Onshape configurations](https://cad.onshape.com/help/Content/PartStudio/managing_configurations.htm), [Fusion configurations](https://help.autodesk.com/cloudhelp/ENU/Fusion-Configurations/files/CFG-CONFIGURATIONS.htm) | Resolved comparison table, changed-value highlighting, rename/update, CSV and sequential batch STL/3MF ZIP with separate reports and parameter records. |
| 3. Repeatable inspection | Perspective makes dimensional comparisons harder; saved cameras forgot section/display/isolation. | [Blender projection](https://docs.blender.org/manual/en/latest/editors/3dview/navigate/projections.html), [Shapr3D saved sections](https://support.shapr3d.com/hc/en-us/articles/26653091404316-26-80-Decals-in-Visualization) | True orthographic projection with compatible controls and picking; optional complete inspection bookmarks; update existing views; old camera-only saves remain usable. |
| 4. Reusable selection | Users repeatedly found the same related parts and could lose their inspection context. | [Fusion selection sets](https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-CREATE-SELECTION-SETS.htm) | Named sets, recall/isolate/update/rename/remove; complete assemblies and attached holes; missing/suppressed/hidden/locked counts; persistent stable references and Undo. |
| 5. Clean slicer handoff | A complete model file did not provide a separate evaluated file and dimensions for each disconnected solid. | [Shapr3D export](https://support.shapr3d.com/hc/en-us/articles/7874524196764-Export), [Prusa export](https://help.prusa3d.com/article/export_1771), [Onshape BOM](https://cad.onshape.com/help/Content/Assembly/bill_of_material.htm) | Per-solid 3D previews, dimensions/volume table, CSV manifest, separate 3MF/STL files and reports in a ZIP. Complete, selection and visible scopes use the existing geometry rules. |

These are official-documentation comparisons, not claims of hands-on competitive benchmarking. The combined variant archive and evaluated-parts manifest are FormForge design decisions. A parts manifest is not a manufacturing bill of materials.

## How to use the improvements

- **Parameters:** open Params. Expand **Used by** to see affected expressions, shapes and variants. Rename a dimension directly. Formula references change together; Undo restores the previous document. Referenced parameters cannot be deleted until their dependencies are removed.
- **Variants:** save sizes in Params, then choose **Compare and export variants**. Select up to eight sizes, choose STL or 3MF, and download the ZIP. **Update from current** replaces a saved configuration in an undoable edit.
- **Views:** Display options → **Orthographic projection**. Open **Saved camera views**, choose whether to include inspection settings, and save. Restoring a camera-only legacy bookmark leaves current inspection settings alone.
- **Selections:** Model or Display options → **Named selection sets**. Save a selected assembly, then Recall or Isolate it later. Rename preserves missing references so Undo can recover deleted parts. Update from selection intentionally replaces membership.
- **Parts:** Export → **Export separate parts and manifest**, or use command search. Review each solid, then download the package. World placement and orientation are preserved.
- Every new workflow is searchable in **Find a command**. Phone layouts scroll within the dialog and keep export actions visible. Precision dialogs render independently of inspector visibility, so changing screen width cannot trap an invisible modal.

## Technical boundaries

- Variants are saved parameter configurations, not feature-suppression or material configurations. At most 24 saved variants, eight per batch, with a 64 MiB package cap. Evaluation is sequential in isolated workers; cancellation, project changes or dialog closure cannot download a partial or stale archive.
- Selection sets support 24 sets and 256 shape IDs per set. Recalling a set never unlocks, unhides or edits a shape. Isolation removes unrelated selections and prevents hidden transform handles.
- Saved views support 12 bookmarks. Projection, frustum height, zoom, camera orientation, section cut, mesh display, grid, reference planes, X-ray, and valid isolated shape IDs are preserved. Inspection is visual; it never changes exported geometry.
- Parts export supports at most 64 solids and 100,000 triangles. It decomposes **evaluated Boolean geometry**, preserving holes and other applied operations. Negative-volume cavity shells cause the complete separation job to stop, with whole-model export offered instead. No cavity is silently filled or omitted.
- Part numbers identify one evaluated snapshot. Quantity is one per exported solid; source-feature ownership, identical-part grouping, colors/material assignments and assembly semantics are not inferred.
- Geometric volume is not filament usage. Reports cover basic size, bed position and mesh presence. Slicer supports, wall thickness, fit, toolpaths and physical print testing remain necessary. This release does not add STEP/BRep editing, manufacturing drawings, live collaboration or G-code generation.

## Verification

- Unit coverage includes parsed name boundaries and numeric exponents, swapped recipe names, variant round trips, undo/deletion guards, CSV formula escaping, actual geometry exported for two different sizes, real Manifold decomposition/cavity rejection, selection reference persistence, old/new view schemas, live OrbitControls projection and wheel navigation, inspection restoration, and late-result cancellation after project changes or closing dialogs.
- Browser journeys run on Chromium desktop and phone: parameter rename → two sizes → ZIP contents; orthographic section and selection-set reopening; two evaluated enclosure parts and their manifest; existing template, export, invalid-input, recovery and accessibility flows.
- The independent review found extreme-zoom framing and hidden-selection gizmo problems. Both were reproduced, fixed and covered with regression tests. Expanded orbit navigation also updates clipping planes during wheel movement.
- Visual evidence: [desktop parameters](qa/precision-v7/parameters-desktop.png), [desktop variants](qa/precision-v7/variants-desktop.png), [phone variants](qa/precision-v7/variants-phone.png), [parts package](qa/precision-v7/parts-desktop.png).

Public release follows feature-branch CI, pull request merge, successful main CI, then deployment of that exact main build artifact. Automated checks establish these tested workflows; they do not establish mass-user preference or a measured 9/10 usability score. That score needs observed beginner and experienced-user task sessions and documented physical prints.

Local release validation: 413 unit tests, successful TypeScript checks and production build, and an entry bundle of 213,930 raw bytes / 68,480 gzip bytes against 307,200 / 102,400 byte budgets. Browser CI contains 14 desktop/phone journeys.
