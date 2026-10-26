# PrintLab beta: assembly, finishing and a quieter home

User-authorized scope: publish a separate beta site; publish changes only there until the user explicitly asks to merge beta into main. Preserve the current public site and GitHub main branch. Add dowels and dovetails for split prints, easier multi-edge chamfers/fillets, and simplify Home around Community, Studio and My Projects.

## Implementation choices

- Reuse the current React/Three/Manifold app. A distinct Sites project, storage and codex/beta branch isolate testing. Keep the original deployment identity in a production reference manifest; active hosting points to beta. New beta starts owner-private under Sites defaults. No production records or uploads are copied. Editable backups can be imported between origins.
- Extend plane splitting with an explicit preview/apply flow and automatic recovery checkpoint. Support bounded connector dimensions, position, count/spacing and clearance. Dowels produce matching sockets plus loose printable pins. Dovetails produce a mating sliding profile with an accessible insertion direction. Reject unsupported intersections/insufficient material rather than silently generating unusable joints. Mesh conversion is disclosed; undo/checkpoint preserve original source.
- Extend the existing box edge treatment to selections of multiple edges, presets and shared size, keeping legacy single-edge documents valid. Keep operation non-destructive and undoable, evaluate before applying, and state supported shape restrictions. Do not imply arbitrary topology-aware imported-mesh fillets.
- Home becomes a compact welcome, three clear destination cards, and a small community preview. Keep templates and advanced features reachable from their appropriate destinations. Reuse existing theme, community data, routes and project recovery.

## Alternatives considered

Using the live site with a beta toggle would share releases and storage with the user's friend, so a separate Site is required. Rebuilding geometry in a new kernel adds compatibility risk; extend bounded existing Manifold features. A community-only root would hide Studio and Projects; retain a short three-way home instead. These are implementation choices made from the user's stated goals.

## Acceptance and limits

Known geometry must produce closed connector parts with measured clearances, no unintended external openings, stale/cancelled previews must not mutate projects, and mesh replacement must checkpoint first. Multiple edge treatments must survive save/import and undo/redo. Home navigation must work on desktop/phone without loading CAD just to browse. Production version/assets must remain unchanged. Run unit/type/build/budget checks and browser regression, review, publish the exact CI artifact to beta only, then verify beta workflows. Physical fit/load/print success remain unverified.
