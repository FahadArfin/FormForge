# Box edge finishing

Open **Find a command → Finish box edges: chamfers and fillets**. Choose an existing box, a finish, a preset or individual edges in the diagram, and one shared size. Preview evaluates a captured document using the same geometry worker as the editor. Apply changes only the box's edge feature in one undoable edit. Remove edge finish is also undoable.

## Supported geometry

- Chamfers support any selection of the twelve straight box edges. The amount is a setback along each adjacent face; intersecting bevel planes produce their natural corner intersections.
- Fillets support any set of parallel box edges. **All edges** creates a rounded cuboid with tangent cylindrical edge surfaces and spherical corner blends, using a Minkowski sum. Mixed partial directions are rejected rather than creating misleading sharp seams between rounded surfaces. Fillet presets therefore show parallel directions rather than top/bottom rims.
- Circular surfaces use bounded 96-segment approximations. They are polygonal geometry, not exact analytic CAD surfaces.
- The size must be at least 0.01 mm and strictly less than half either adjacent face dimension. The source must be an unscaled, undeformed box without surface modifiers. Attached holes and volume sculpting are rejected; ordinary Boolean cutouts remain usable.
- The diagram follows local box axes. It is a selection aid, not a world-space screenshot. The geometry preview shows the complete finished design. Solid result shows the finish; Edit shapes retains the source box outline.

The design follows the selection-set and shared-size workflow used in [Fusion fillets](https://help.autodesk.com/view/fusion360/ENU/?contextId=SLD-FILLET-SOLID), with a deliberately narrower supported geometry scope. This feature does not select arbitrary edges of imported meshes or provide arbitrary-face corner patching.

## Safety and persistence

The optional `edgeTreatment.edges` array extends the existing version-1 metadata. Existing single-edge documents omit the array and evaluate identically. New documents retain the original primitive, named parameter bindings, and feature metadata; no mesh conversion occurs. The legacy `axis`, `sideU`, and `sideV` fields mirror the first edge for readable provenance, while the array is authoritative when present. Older PrintLab versions may ignore the new array and render only that first edge; use the beta to edit or export multi-edge designs.

Changing project data, target, finish settings, or selection invalidates the pending preview. Cancel, worker failure, timeout, stale completion, invalid dimensions, or non-closed results never apply a change. A successful preview is not a print-strength, surface-finish, or physical-fit guarantee. Printability and minimum-wall checks should still be run after finishing.
