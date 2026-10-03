# FormForge next CAD workflows

Priorities 11–20 continue the first ten improvements. The order follows the existing roadmap for beginners and intermediate makers.

| Priority | Where to find it | What it does |
| --- | --- | --- |
| 11 | CAD toolkit → Create → Workplane | Choose XY/XZ/YZ, offset a plane, pick a mesh face, or look straight at the plane. New primitives and drawn profiles use its coordinates. |
| 12 | CAD toolkit → Prepare → Pick contact face | Orient an outer supporting face onto the bed. Solid result moves the complete model; source view expands explicit groups and inserted assemblies. |
| 13 | CAD toolkit → Create → Emboss / deboss text | Create an editable label in bundled Helvetiker. Select its source to revise wording, size, depth, or operation. Contact stays fixed when depth changes. |
| 14 | CAD toolkit → Create → Trace an image | Import PNG/JPEG/WebP, identify two points and their known distance, adjust opacity, hide it, or move it to the current plane. |
| 15 | CAD toolkit → Create → Insert reusable parts | Copy a local project as editable parts. Node, group, material and parameter identifiers are remapped. Imported cutters remain within their assembly. |
| 16 | CAD toolkit → Prepare → Align and pattern assemblies | Align evaluated bounds with a signed gap; repeat whole assemblies linearly or around an explicit polar origin. |
| 17 | CAD toolkit → Create → Enclosures, brackets, adapters and snaps | Create editable enclosure/lid/boss, bracket, constant-normal-wall tapered adapter, and snap-fit calibration recipes. |
| 18 | CAD toolkit → Inspect → Dimensions and angles | Pin distances and three-point angles. Geometry changes hide stale labels and mark them for review. |
| 19 | Print → Material and cost | Save device printer/material setups, enter material density and price, and compare solid-material equivalent mass with entered slicer mass. |
| 20 | Workshop or Project actions → Cloud & review; Getting started | Save private cloud snapshots, share expiring review links, discuss specific versions, and follow four guided tasks with explicit learning privacy choices. |

## Modeling boundaries

- Workplanes are fixed frames, not references that follow subsequent face edits. Curved mesh triangles can be picked, but do not become analytic surfaces.
- Face placement rejects a recessed/non-supporting face, removed source faces, locked groups, incompatible transform bindings, and global volume sculpting. Use checkpoints and an evaluated mesh conversion where required.
- Text supports 80 characters, three lines, and the bundled font's glyph coverage. Geometry editing of a text mesh removes its text descriptor to avoid implying that hand-sculpted details survive regeneration.
- A project embeds one reference image. Input files are limited to 5 MB and 16 million decoded pixels, resized to at most 2,048 pixels on either side. Images stay out of manufacturing exports.
- Part insertion excludes the source project's reference image, annotations, variants, printer settings and project identity. Dimension formulas are copied under new names. Pattern instances remain independent transforms with shared copied dimension formulas.
- Assembly alignment measures bounding-box gaps. It does not solve mates or guarantee curved-surface contact. Pattern operations are bounded to 64 instances, 2,000 nodes and eight assembly nesting levels.
- Recipe geometry is validated by the installed Manifold engine. Physical clearance, snap flexibility, fastener fit and strength still require a printed test in the intended material.
- Material cost uses volume × density × price, explicitly labeled as fully solid equivalent. Supports, infill, waste, energy and slicing time are excluded. Slicer results become stale when geometry changes and are excluded from reusable presets.

## Cloud and review behavior

The public CAD editor continues to work without an account. Cloud operations require a real ChatGPT identity supplied by the Sites dispatcher. Models upload only after an explicit cloud-save action; ordinary autosave remains on the device.

The owner can create and update private projects. Other signed-in users need a review link; they can inspect/download retained snapshots, open local editable copies, comment, reply and resolve their own discussion threads. They cannot replace the owner's snapshots. The owner can resolve any thread.

Links expire after seven days. Replacing or revoking a link invalidates existing reviewer grants. Access is checked on every cloud request and again inside comment mutations. Already downloaded copies cannot be recalled. Link delivery is manual; FormForge does not send invitations or messages to others.

Updates require the expected cloud revision. Conflicting or stale saves leave the current cloud snapshot unchanged. Opening an old snapshot preserves that revision, so it cannot silently replace newer work. Save a new cloud project to continue an older version.

Limits: 50 projects, 20 retained snapshots per project, 4 MB per snapshot, 50 MB per account including pending deletions, 500 comments per project, 2,000 characters per comment, and 30 comments per account per minute. Deletions retain a retryable file-removal record until object storage confirms success. The cloud panel exposes pending removals for retry.

Signed-in learning progress is stored with the account. Anonymous progress lasts for the current visit. Task completion counts are off by default, opt-in, visible, and clearable. Disabling statistics clears them. No model contents or external analytics service are involved.

## Verification

Behavioral tests exercise coordinate transforms, signed scales, text counters and contact preservation, image calibration, parameter remapping, assembly cutter isolation, all four recipes with real Boolean evaluation, annotation invalidation, cost arithmetic, and editor recovery.

Cloud tests run the actual SQL against SQLite and an isolated object-store adapter. They cover authentication, ownership, same-origin writes, revision conflicts, simultaneous updates, snapshots, reviewer permissions, replies, revocation between access and mutation, expired/rotated links, input limits, learning privacy, and retryable deletion. Production packaging checks every embedded asset's hash and the anonymous session route.

Browser acceptance covers enclosure creation, picked-face text placement, a pinned 90° angle, a generated image calibrated to 80 × 40 mm, saved material presets, assembly pattern/undo, a 5 mm contact gap, reload persistence, and desktop/narrow layouts. These are software checks; they do not establish physical fit, formal accessibility compliance, multi-user load capacity, or two-account production collaboration.

## Implementation and operations

The hosted Worker serves the same built CAD assets and adds `/api/cloud`. D1 stores project/review metadata and learning preferences; R2 stores immutable editable project snapshots. Drizzle owns schema changes. The legacy Fastify/community/generation service is separate and is not presented as part of this cloud-review service. The service worker never caches cloud or sign-in responses.

Release through the feature branch, GitHub validation, PR and main validation, then publish the exact successful main artifact to the existing public Site. Review deployment status and anonymous endpoint behavior after publication.
