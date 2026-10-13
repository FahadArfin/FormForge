# Independent shapes and explicit combinations

New shapes and ordinary saved projects open in Edit shapes. Each ungrouped source remains independently selectable and movable, even when it overlaps another shape. The existing Solid result preview and export evaluator are unchanged; use that view to inspect the combined printable result, including legacy global cutouts and volume sculpting.

Select multiple shapes with Shift-click, the model list multi-select, or Select All. The buttons directly beneath the transform tools provide Join (union), Exclude (first selected shape minus the others), and Intersect (shared volume). The same actions are available in the selection inspector. Each operation is one undoable edit and retains the original editable operands and existing file format.

A combined shape displays its evaluated surface while editing. Selecting any of its source rows selects the full group. Dragging, rotation, scaling and duplication preserve group membership. Separate restores independently editable solid parts; Undo restores the exact previous combination.

This release supports one level of explicit combination. Separate existing groups before combining again, aligning/distributing their individual parts, or polygon-editing their source meshes. Attached holes and inserted assemblies retain their existing protections. Group display meshes are cancellable, disposable local caches and are never written over source geometry. Legacy projects with global cuts, attached features, assemblies or volume sculpting continue opening in Solid result.

Validation covers exact Boolean volumes, source round trips, group selection, lock protection, undo, caches beyond 32 groups, hidden legacy operands, and desktop/phone placement, drag, combination, separation and reload flows.
