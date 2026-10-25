# Split-part connectors

In Studio, use **Find a command → Split into printable pieces**, set the section plane, then choose **Dowel pins** or **Sliding dovetail**. Plain capped splitting remains available. Connector modes keep both halves.

The workflow is informed by [PrusaSlicer's cut and connector tools](https://help.prusa3d.com/article/cut-tool_1779). Loose dowels and integrated dovetail rails solve different assembly problems, so PrintLab presents them as explicit choices rather than calling every joint a plug.

## Dowels

- Each requested connector creates two matching blind sockets plus one separate printable pin. Apply places the halves and upright pins in a separated row at bed Z = 0. Check printer fit and rearrange them before export.
- Pin diameter is the nominal male diameter. Socket diameter = pin diameter + twice the **clearance per side**. Pin length = twice (socket depth minus clearance), providing the same nominal allowance at each blind end.
- The pins, both halves, and all existing source geometry use millimeters. No hardware-specific or printer-specific fit is assumed.
- Connector centers form a centered row along the cut face's U axis. Offsets are measured from the evaluated model bounds' center on that face, not inferred from a surface centroid. Count, spacing, both face offsets, diameter, depth, clearance and surrounding wall are editable before preview.
- Each socket's full cylindrical material envelope, including the requested radial and end wall, must lie inside the actual evaluated source solid. An intersection/difference volume check rejects holes, thin walls, external openings and gaps that a bounds-only check would miss.

## Sliding dovetails

- The negative half receives an integrated rail; the positive half receives its matching channel. Neck width, head width, depth, count, spacing, transverse offset and clearance are editable.
- The head must be at least 1 mm wider than the neck. The channel comes from a miter-offset profile; clearance is the nominal perpendicular allowance on each mating surface.
- The rail and channel extend through the full V-axis length of the source bounds. The channel intentionally opens at both ends, permitting assembly by sliding along V. Assembly access outside the finished part is required.
- Plane X: row along Y, slide along Z. Plane Y: row along Z, slide along X. Plane Z: row along X, slide along Y.
- A continuous rectangular material envelope around the whole channel must lie inside the evaluated solid. This deliberately supports straight, unobstructed cut faces and rejects hollow, interrupted or irregular paths that cannot safely contain the rail. It does not attempt a curved or blind dovetail joint.
- Real Manifold tests cover collision-free insertion from both ends along all three axes, not only final assembled placement.

## Bounds and geometry checks

Counts are 1–8; clearance is 0.05–1 mm per side; requested surrounding wall is 0.8–10 mm; socket/rail depth is 2–100 mm. Dowel diameter is 2–50 mm; dovetail neck is 2–50 mm and head is 3–80 mm. Connector spacing must preserve the requested wall between neighbors. Dovetail channel length must be 4–1000 mm. These limits bound computation and prevent clearly invalid input; they are not manufacturing recommendations.

The existing worker validates source mesh closure, finite coordinates and complexity. Connector geometry must leave each half as one nonempty connected manifold solid; the final two halves must not interfere. Numerical containment uses a small volume tolerance for the kernel. This is deterministic geometry validation, not proof of physical fit or strength. Print a small fit coupon and adjust clearance for the printer, material and orientation. Evaluate support needs and choose print orientations after splitting.

## Preview, apply and recovery

Preview evaluates a captured document in an isolated worker. Inspect either half or any pin using **Preview part**. Discard, cancellation, timeout, invalid geometry, and project/settings edits leave the source untouched. Changing a plane or field invalidates its preview.

**Apply split** first saves a local recovery checkpoint (**Before split with connectors**, or **Before plane split**). Save failure prevents replacement. The source and settings are rechecked after the asynchronous save, so edits or cancellation during storage cannot apply stale output. Leaving the panel cancels pending work. The accepted replacement is one undoable document action.

Splitting bakes the whole evaluated model, including sculpting and existing cuts, into independent mesh nodes. Original primitive parameters, bindings and material assignments are not editable in the resulting meshes; original source remains recoverable through Undo and the saved History checkpoint. Existing plain split APIs remain valid, including the AI engineering session that manages its own preview and checkpoint. No new persisted project schema is required.

For connector modes, Apply translates the halves and pins into a centered row along X, with an 8 mm gap between their bounding boxes. Every part's Y center is 0 and its minimum Z is 0; original evaluated mesh vertices remain unchanged, with placement stored in ordinary node transforms. This separation prevents whole-model export from fusing touching assembly faces or closing dowel sockets into internal cavities. The preview displays each individual part before this translation. The layout does not rotate parts or guarantee build-volume fit; rearrange/orient them before printing. Real integration tests cover evaluated whole-model geometry, separate-parts export and plate arrangement along all axes, including translated source objects.

Plain splits retain the legacy world-space assembly positions. Physical fit, load capacity, actual print success and material behavior remain unverified.
