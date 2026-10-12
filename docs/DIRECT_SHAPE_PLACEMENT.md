# Direct shape placement

PrintLab reuses the existing editable primitive nodes, Three.js viewport, source geometry, workplane transforms, and single-transaction placement history.

## Interaction

- Choose Solid or Cutout, then click a shape. The phone drawer closes automatically.
- The translucent preview follows the pointer. Click to place the default size, or drag to draw a snapped footprint. Rectangular shapes use opposite corners; radial shapes use center-to-radius.
- Live dimensions show the preview's world bounds. Release places the shape as one undo step.
- Drag the placed body to move it on the active workplane. Drag empty space to orbit. Resize shape exposes existing scale handles; Size retains exact dimensions and proportional sizing.
- Cancel, Escape, switching tools, and pointer cancellation discard placement. Interrupted body drags restore the unchanged document. Document/tool changes invalidate transient gestures.
- The first shape stays where it was drawn instead of triggering automatic camera framing. Imported projects retain automatic framing.
- Solid-view picking requires a matching evaluated surface, so empty Boolean holes do not select hidden source operands.

## Research

[Blender Add Cube](https://docs.blender.org/manual/en/latest/editors/3dview/toolbar/add_cube.html) and the [Blender interactive-object design](https://archive.blender.org/developer/maniphest/0057/0057210/index.html) describe direct construction by dragging. PrintLab uses a single drag for the footprint, with height available through existing resize handles and exact dimensions afterward. This avoids making a second height gesture compulsory for beginners.

## Regression coverage

`shapePlacement.test.ts`: negative-direction rectangular draws, snapping, default click placement, small radial geometry, rotated/offset workplanes, and unchanged source nodes.

`editor.test.ts`: cancellation, switching tools, and one-step creation undo.

`direct-placement.spec.ts`: desktop/phone placement, live dimensions, direct movement, quick movement from Solid view, undo/redo, editable backup and saved reload, touch placement, pointer cancellation, vertical workplanes, and empty Boolean holes. Existing volume-sculpt scenarios verify that camera control remains disabled during sculpt strokes.

Storage names, file formats, API routes, and geometry workers are unchanged.
