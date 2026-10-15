# Independent shapes and explicit combinations

New shapes and ordinary saved projects open in Edit shapes. Each ungrouped source remains independently selectable and movable, even when it overlaps another shape. The existing Solid result preview and export evaluator are unchanged; use that view to inspect the combined printable result, including legacy global cutouts and volume sculpting.

Select multiple shapes with Shift-click, the model list multi-select, or Select All. The buttons directly beneath the transform tools provide Join (union), Exclude (first selected shape minus the others), and Intersect (shared volume). The same actions are available in the selection inspector. Each operation is one undoable edit and retains the original editable operands and existing file format.

A combined shape displays its evaluated surface while editing. Selecting any of its source rows selects the full group. Dragging, rotation, scaling and duplication preserve group membership. Separate restores independently editable solid parts; Undo restores the exact previous combination.

Existing groups can be combined again. Each new operation wraps the selected objects in an editable Boolean layer without rewriting earlier cut/intersection roles. Separate peels only the outermost layer, revealing the previous groups. Nested operations support up to 32 layers; reaching that bound leaves the original unchanged. Imported assemblies retain scoped cutters; select a complete inserted assembly when combining across assembly boundaries.

The optional `booleanPath` node metadata stores outer-to-inner layers with group ID, operand ID, operation, and operand role. Legacy flat groups remain valid. Duplication and insertion remap every layer identity, while transforms, selection, preview caches, Undo and editable backups preserve nesting. Polygon editing and operand alignment still require separating the relevant layer. STL and standard 3MF use the evaluated solid; separate-part multi-color 3MF is disabled for nested operations because that format path would lose the cuts.

Validation covers exact Boolean volumes, source round trips, group selection, lock protection, undo, caches beyond 32 groups, hidden legacy operands, and desktop/phone placement, drag, combination, separation and reload flows.
