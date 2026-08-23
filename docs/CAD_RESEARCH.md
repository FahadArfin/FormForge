# FormForge CAD research and implementation map

This document records the product patterns selected from the requested modeling systems. It is a clean-room feature analysis, not copied source code.

## Product direction

FormForge keeps one beginner-facing workflow—choose or describe a form, size it, place it, then edit it—while advanced controls progressively appear in Pro mode. Every generated result should remain an ordinary editable timeline feature. Expensive geometry is evaluated off the UI thread and only the newest model revision may update the viewport.

## Systems and adopted patterns

| System | Strong pattern | FormForge implementation |
| --- | --- | --- |
| [Open Cascade Technology](https://dev.opencascade.org/doc/overview/html/) | Geometry/topology separation, robust Boolean history, document transactions, XDE metadata | Editable feature document, worker-side watertight Boolean evaluation, grouped history, layers/colors/material slots. A native OCCT service remains the future exact-BRep path. |
| [SolveSpace](https://solvespace.com/tech.pl) | Constraint expressions, degrees-of-freedom feedback, drag weighting | Iterative profile solver for horizontal, vertical, distance, coincident, equal-length, parallel, perpendicular and signed-angle rules, with residual, rank, degree-of-freedom, redundancy and conflict diagnostics. The inspector previews, adds, removes and solves its exposed rules. |
| [Art of Illusion](https://github.com/ArtOfIllusion/ArtOfIllusion) | Approachable combined modeling gestures and modifier-oriented workflow | Drag-to-size placement, direct manipulation, editable deformation and surface modifiers. |
| [OpenJSCAD](https://openjscad.xyz/docs/) | Safe functional/declarative CAD, parameter definitions, browser workers | A non-JavaScript declarative CAD console that creates editable features without arbitrary code execution. |
| [JSketcher](https://github.com/xibyte/jsketcher) | Browser CAD feature history, OCCT/WASM, sketches, loft/sweep/shell/fillet patterns | Feature timeline, profile sketch/extrude/revolve, solver-backed constraints, loft, rounded solids, hollow/refine/simplify controls and GLB import. |
| [QCAD](https://qcad.org/en/documentation/features) | Tool preview/apply transactions, rich snaps, layers, blocks, command workflow | Pre-placement dimensions, preview/commit interactions, movement granularity, layers, grouped features and safe command console. |
| [LibreCAD](https://docs.librecad.org/en/latest/ref/fundamentals.html) | Visual inference, relative/polar precision, grouped undo | Horizontal/vertical inference, exact numeric and constraint inspectors, snap/nudge modifiers and transactional Undo/Redo. |
| [OpenVSP](https://github.com/OpenVSP/OpenVSP) | Stable parameter IDs, ordered cross-section lofts, variants and analyses | Stable feature IDs, editable tapered/twisted loft sections, timeline evaluation and print analysis. |
| ZBrush-style brush modeling | Local brush falloff, masks, symmetry, adaptive detail | Draw, clay, smooth, crease, grab, inflate, pinch, flatten, snake, relax, masks, symmetry and adaptive subdivision in Polygon Sculpt. |
| [Blender mesh editing](https://docs.blender.org/manual/en/4.0/modeling/meshes/editing/index.html) | Component-level topology, proportional editing, modifier stack | Object/vertex/edge/face modes, component overlays and picking, selection conversion/grow/shrink/linked/boundary, masked soft transforms, and manifold-checked face extrusion, inset, deletion and conservative vertex dissolve. This is an indexed-triangle topology layer, not a full BMesh clone. |
| [Maya Quad Draw](https://help.autodesk.com/cloudhelp/2023/ENU/Maya-Modeling/files/GUID-C8EC81A1-46B2-498C-A759-7DC304D8B687.htm) | Retopology directly over a live surface | The current mesh overlay and sculpt surface are the foundation; dedicated quad-draw/retopology is not yet implemented. |
| [Fusion 360 parameters](https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-MODIFY-PARAMETERS.htm) | Named editable parameters and ordered feature history | Persisted named parameters, unit-aware formulas and dependency evaluation, per-feature dimension/position/rotation bindings, error reporting and automatic bound-model rebuilds. |
| [Wings 3D](https://www.wings3d.com/documentation/user-manual-table-of-contents/) | Context-sensitive tools, cage/smooth preview, selection modes | Simple/Pro disclosure, contextual inspector, solid/wire/vertex display, component selection modes, connected-island and open-boundary selection, and localized sculpt workflow. |

## Implemented CAD foundations

### Named parameters

Named parameters are persisted in the document schema and edited in a dedicated Parameters panel. The expression engine supports numeric literals, case-insensitive named or bracketed references, parentheses and `+`, `-`, `*`, `/`; it builds a dependency graph and reports duplicate names, unknown references, cycles, unit mismatches, division by zero and non-finite results. Length units (`mm`, `cm`, `m`, `in`) and angle units (`deg`, `rad`) are converted by dimension. Bindings can drive supported size, wall, position, twist and rotation fields, and a successful edit resolves the document before scheduling its geometry rebuild.

### Sketch constraints

Profiles persist constraint records and are solved by an iterative position-projection solver. Point rules cover horizontal, vertical, distance and coincident relationships; segment rules cover equal length, parallel, perpendicular and signed angle. Anchors and fixed points are supported. Solver results include per-rule residuals, convergence, estimated rank and degrees of freedom, redundant-rule count and conflicting/invalid rule diagnostics. The inspector provides a beginner rule builder, preview, add/remove, solve-now status and an expert diagnostics disclosure; automatic profile creation still infers horizontal and vertical edges.

### Polygon component editing

The browser mesh layer canonicalizes indexed triangles, welds positional duplicates, extracts vertex/edge/face adjacency and validates manifold and watertight topology. It supports component-mode conversion, grow/shrink, connected-island and open-boundary selection. Two-seed shortest-path selection uses the mesh adjacency graph: vertex paths minimize accumulated edge length, while edge paths measure midpoint-to-midpoint travel through shared vertices. Disconnected or invalid seeds fail without changing the selection.

Edge-loop selection is deliberately conservative on the indexed-triangle mesh. It reconstructs a local quad only when a coplanar triangle pair has an unambiguous, convex four-edge boundary, then follows opposite sides while the strip remains unique. It stops at boundaries and rejects ambiguous pairings, branching strips, reconstructed diagonals and unsafe topology instead of guessing. This provides useful loop selection on clear quad-like regions without claiming the guarantees of a persistent half-edge/BMesh core.

Vertex transforms provide translation, X/Y/Z Euler rotation and nonuniform scale around a median or explicit pivot, with Euclidean, topological or surface-distance soft selection, selectable falloff and sculpt-mask protection. Face regions can be extruded, a triangular face can be inset, faces can be deleted only when the remainder stays manifold, and a valence-three vertex can be dissolved only when the result remains closed and valid. Broader n-gon editing, bevels, arbitrary edge rings and ambiguous loop traversal still require a persistent half-edge topology core.

### Closed-profile geometry sampling

The model package contains a tested deterministic sampler for simple closed profiles. It normalizes winding, removes duplicates, validates finite/non-self-intersecting input, supports mitered inward/outward offsets, rounded-corner arc sampling and stable closed cardinal splines, and caps source/output size. Extrude and revolve use the same sampler and fallback chain in both the live preview and manufacturing worker. Their inspector offers straight, rounded and smooth styles, offset/radius/tension/resolution controls, a local no-rebuild preview, and editable control points that commit only when the user applies the profile.

### Validated profile recipes

The beginner Outline recipes panel exposes seven deterministic constructors: circle, ellipse, regular polygon, star, capsule/slot, rounded rectangle and a gear-like outline. Width and height are full profile extents; regular polygons expose a side count, stars expose a tip count and inner-to-outer radius ratio, gears expose a tooth count and inner-to-outer radius ratio, and rounded rectangles expose a corner radius clamped to half the smaller dimension. The model kernel rejects non-finite or unsafe dimensions, unsupported counts and out-of-range ratios. Successful recipes produce finite, simple, counter-clockwise control loops with the requested bounds and are checked by the same closed-profile sampler used by runtime geometry. “Gear-like” is intentional: this is a printable toothed outline, not an involute-gear generator or an engineering gear standard.

Recipe inputs remain a local draft. Changing dimensions or recipe options does not modify the model document, start CSG or queue a geometry-worker rebuild; selecting **Create** commits one ordinary, editable extrude or revolve feature. Extrude profiles are centered on their two-dimensional bounding box. Revolve profiles are centered vertically and translated so their minimum radial X coordinate lies on `x = 0`, giving them a predictable rotation axis. After creation, normal feature edits and worker rebuild behavior apply.

This workflow follows the broad declarative, parameterized construction pattern seen in [OpenJSCAD](https://openjscad.xyz/docs/) and other parametric CAD systems: a small validated specification produces editable geometry. The recipe kernel is clean-room FormForge code; it does not embed OpenJSCAD or claim the full modeling language, constraint system or geometric kernel of those projects.

## TRELLIS.2 integration

[TRELLIS.2](https://github.com/microsoft/TRELLIS.2) is a single-image-conditioned 3D generator; it is not a text-conditioned chat model. The implemented flow therefore separates these stages:

1. Chat creates a deterministic, editable parametric starter model, or the user uploads/chooses a reference image.
2. Local Relief converts that image privately into a closed printable height-field mesh.
3. Optional TRELLIS.2 sends the explicitly selected image to a configured provider, follows the preprocessing → generation → GLB extraction session, validates the returned GLB, and imports it for editing.
4. Print checks remain mandatory because generated meshes can contain thin walls, self-intersections or holes.

The official local setup targets Linux/CUDA and recommends an NVIDIA GPU with at least 24 GB memory. Docker therefore keeps TRELLIS disabled by default. Set `TRELLIS_SPACE_ENABLED=true` and configure `TRELLIS_SPACE`/`HF_TOKEN` to opt in to the external adapter. The shared public Space is useful for experiments, not a production SLA.

Sources: [official repository](https://github.com/microsoft/TRELLIS.2), [model card](https://huggingface.co/microsoft/TRELLIS.2-4B), [project page](https://microsoft.github.io/TRELLIS.2/), [official Space](https://huggingface.co/spaces/microsoft/TRELLIS.2).

## Kernel-scale future work

Exact BRep fillet propagation, persistent topological naming, assembly constraints, a production sparse/geometric constraint solver with drag constraints, quad retopology, bevel/loop/ring and n-gon editing, NURBS surface editing, and production GPU model hosting are larger subsystems rather than UI additions. The current architecture leaves clean seams for an OCCT worker/service, a stronger constraint kernel and a persistent half-edge/BMesh-style mesh core without making beginners interact with those internals.
