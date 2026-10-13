# Smooth volume sculpting

Volume add and Volume carve now sweep a round brush continuously along each drag. The previous union of separated spherical stamps produced scalloped ridges, especially when pointer samples were far apart. New segments use the convex hull of equal-radius endpoint spheres through the existing Manifold geometry engine, producing editable, exportable capsule segments. Higher radial resolution and crease-aware shading reduce faceting while preserving hard model edges.

Each drag raycasts a frozen copy of the surface present at its start. This prevents new material from lifting the next brush sample and making a staircase. Release and start another drag to build up or deepen the surface. Missing surface samples, sharp normal changes, changed brush settings and separate gestures break continuity. Intervening surface sampling prevents fast pointer jumps across separated parts from joining them. Symmetry mirrors both segment endpoints.

## Compatibility and behavior

- Optional `sweepFrom` coordinates are stored in ordinary sculpt history. Older strokes without this field retain their original sphere resolution and geometry; old projects are not silently remodeled.
- Preview remains incremental during the drag. A drag remains one undo step; save/reload and editable backup preserve its endpoints.
- Whole-model plate placement translates both endpoints. Export uses the swept solid; smooth render normals do not change exported geometry.
- Smooth refers to continuity along a brush stroke. Separate overlapping strokes can still form seams, and sharply changing direction or radius can produce corners. This does not perform whole-model voxel remeshing or automatic filleting.
- Existing sampled grooves are unchanged. Undo and redraw them with the new brush, or use the existing mesh sculpt tools after an explicit mesh conversion.

## Verification

Real Manifold tests compare surface heights between widely separated brush samples for add and carve, compare live batches with full replay, and invalidate cached solids when endpoints change. Schema and plate-placement tests preserve both legacy stamps and new swept strokes. The browser regression requires multiple evaluated and rendered updates while the pointer is still down, level centers on a flat source, one-step undo/redo, and matching volume after saved reload on desktop and phone.

Manifold can triangulate coplanar faces differently between a sequence of evaluated batches and a full replay. Regression checks compare the solid volume and sampled surface heights, rather than requiring an identical triangle count.

## Research

[Manifold JavaScript API](https://manifoldcad.org/docs/jsuser/classes/Manifold.html) documents convex hull construction and sphere segmentation used here. [Blender brush stroke documentation](https://docs.blender.org/manual/en/latest/sculpt_paint/brush/stroke.html) describes spaced brush applications; reducing spacing alone still leaves scallops and increases the number of Boolean operations. A swept segment addresses the geometric gap directly without replacing the existing modeling engine.
