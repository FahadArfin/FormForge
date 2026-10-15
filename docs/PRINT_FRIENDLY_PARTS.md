# Print-friendly parts: research and implementation

The goal is to help beginners make cleaner-looking, useful printed parts while retaining PrintLab's editable geometry and local-first workflow.

## Research, October 15, 2026

| Opportunity | Why it helps | Current delivery |
| --- | --- | --- |
| Vented panels with controlled patterns | Regular openings and an intact border make deliberate-looking covers and grilles. | Implemented: round holes or rounded slots, centered rows/columns, border, gap, corner radius, nominal open-area readout. |
| Reinforcement ribs/gussets | Provide an editable way to add material between bracket faces. | Implemented: one center or two side ribs, adjustable reach/height/thickness, four mounting holes kept clear of ribs and edges. Strength remains unverified. |
| Threaded-insert mounting bosses | Make reusable mounts with measured bore dimensions instead of repeatedly threading screws into plastic. | Implemented: flange, blind bore, surrounding wall, remaining floor and entry chamfer. No automatic screw-size/insert-size mapping. |
| Connectors for split parts | Dowels, plugs and dovetails can help users align separately printed sections. | Follow-up: existing plane splitting remains available; automatic mating connectors need joint placement and mesh-conversion recovery work. |
| Multi-edge finishing | Coordinated chamfers/fillets can improve handling and appearance. | Follow-up: existing single-box-edge prototype remains available; arbitrary joined/imported surfaces need a more capable topology-aware implementation. |

Fusion's [Rib tool](https://help.autodesk.com/view/fusion360/ENU/?contextId=SLD-RIB) creates thin support features with thickness and extent controls. Its [Geometric Pattern tool](https://help.autodesk.com/view/fusion360/ENU/?contextId=SLD-GEOMETRIC-PATTERN) distributes shapes across faces. PrintLab's new recipes implement a smaller, explicit set of these ideas with existing primitives and profiles.

[CNC Kitchen's insert design guidance](https://www.cnckitchen.com/blog/tips-and-tricks-for-heat-set-inserts) emphasizes hardware-specific bore dimensions and testing actual printed fit. The boss uses illustrative custom dimensions, not an asserted hardware standard or retention rating.

[PrusaSlicer's Cut tool](https://help.prusa3d.com/article/cut-tool_1779?product=mmu1) supports plugs, dowels, snap connectors and dovetail cuts. This informs the connector follow-up. Prusa's [modeling guidance](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135?product=core-one-l) also explains why orientation and support contact affect surface finish; existing PrintLab orientation and overhang tools already address part of this need.

Already present: fit-test coupons and saved fit results, counterbores/countersinks/nut pockets, attached holes, text emboss/deboss, manual patterns, mesh repair, orientation comparison, material profiles and STL/3MF export. These have not been reimplemented.

## User flow and boundaries

Open **Build → Print-friendly parts**, or **CAD toolkit → Create → Print-friendly parts**. The command menu also finds vents, gussets and insert mounts. Choose a recipe, enter measurements, and select **Preview part**. A dedicated geometry worker evaluates a separate snapshot. The model remains unchanged until **Add editable part**.

The addition is a grouped collection of ordinary editable primitives/profiles, placed beside existing source bounds. It moves as one object and can be combined using Join/Exclude/Intersect or resized. Separate releases the construction shapes as solids, so the openings disappear until the original cutters are set back to Cutout and joined again. Set recipe dimensions before adding when possible. The complete addition is one undo transaction. Save/import uses the existing project format without schema changes.

Input bounds, maximum 64 vent openings, minimum border/web/floor checks and closed-mesh verification are deterministic checks of the generated recipe, not certification. A project edit, cancellation, recipe edit or unmount invalidates/discards the preview. Errors do not apply partial geometry. Volume-sculpted projects require baking before insertion. Nominal build-volume and configured exclusion warnings are shown when placement needs adjustment; automatic packing is not implied.

The preview is the new part only. It is not a simulation of loads, air flow, heat, insert retention or a successful print. Inspect orientation, wall settings and supports in your slicer; use manufacturer dimensions and physical fit samples.

## Validation

Generator tests use the real Manifold worker for volume, connectedness, watertightness and base position. Additional cases cover invalid dimensions, border/rib/hole constraints, round-hole volume, insert floor and placement isolation. Preview tests cover cancellation, worker failure, empty/open geometry, staleness and atomic insertion. Browser coverage exercises discovery, preview-before-add, editable backup, undo/redo and phone drawers.
