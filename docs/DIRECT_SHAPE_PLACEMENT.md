# Direct shape placement

PrintLab reuses the existing editable primitive nodes, Three.js viewport, source geometry, workplane transforms, and single-transaction placement history.

## Interaction

- Choose Solid or Cutout, then click a shape. The phone drawer closes automatically.
- The translucent preview follows the pointer. Click to place the default size, or drag to draw a snapped footprint. Rectangular shapes use opposite corners; radial shapes use center-to-radius.
- Live dimensions show the preview's world bounds. After drawing the footprint of a height-based primitive, release to set height: move the mouse upward, or drag upward on a touch screen, then click/release to finish. The height field also accepts exact millimeters; Finish shape or Enter commits. The entire placement is one undo step. A simple click still places the default size, and spheres, rings, and pre-sized profile recipes retain their existing placement flow.
- Drag the placed body to move it on the active workplane. Drag empty space to orbit. Resize shape exposes existing scale handles; Size retains exact dimensions and proportional sizing.
- Shift-click separate shapes to select them together and enable Join, Exclude, and Intersect. Selection clicks take priority over move/rotate/resize handles; Shift-clicking empty plate keeps the selection. Ctrl/Command-click remains an equivalent selection toggle. Exclude keeps the first selected shape.
- Cancel, Escape, switching tools, and pointer cancellation discard placement. Interrupted body drags restore the unchanged document. Document/tool changes invalidate transient gestures.
- The first shape stays where it was drawn instead of triggering automatic camera framing. Imported projects retain automatic framing.
- Solid-view picking requires a matching evaluated surface, so empty Boolean holes do not select hidden source operands.

## Research

[Blender Add Cube](https://docs.blender.org/manual/en/latest/editors/3dview/toolbar/add_cube.html) and the [Blender interactive-object design](https://archive.blender.org/developer/maniphest/0057/0057210/index.html) describe direct construction by dragging. PrintLab now follows footprint drawing with a height preview for height-based primitives. Quick click placement remains available for default-size shapes. Height is measured along the active workplane normal; the base remains on that plane.

## Regression coverage

`shapePlacement.test.ts`: negative-direction rectangular draws, footprint and height snapping, bounded finite heights, default click placement, small radial geometry, rotated/offset workplanes, and unchanged source nodes.

`editor.test.ts`: cancellation, switching tools, and one-step creation undo.

`direct-placement.spec.ts`: desktop/phone placement, live dimensions, direct movement, quick movement from Solid view, undo/redo, editable backup and saved reload, real touch footprint/height gestures, cancellation from the height field, invalid height input, display toggles, pointer cancellation, vertical workplanes, and empty Boolean holes. Existing volume-sculpt scenarios verify that camera control remains disabled during sculpt strokes.

Storage names, file formats, API routes, and geometry workers are unchanged.
