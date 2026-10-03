# FormForge UX redesign

Research and initial audit: September 12, 2026.

## Starting evidence

The redesign addresses the working product's navigation and modeling workflows. Initial browser screenshots:

- [Community landing page](ux-evidence/before-community.png)
- [Projects and collections](ux-evidence/before-projects.png)
- [Modeling workspace](ux-evidence/before-studio.png)

Code inspection confirmed the following friction:

- `App.tsx` initially opens Community, even for someone returning to their own model. Editing keyboard handlers also run outside Studio.
- `ProjectsHome.tsx` has collections and recent timestamps but no search or sorting controls; every preview uses the same box icon.
- `Toolbox.tsx` mixes shape creation, transformations, polygon conversion, brushes, and brush settings in one long panel.
- `TopBar.tsx` shows a cloud icon for a device-local IndexedDB save. The store autosaves after 500ms without surfacing completion or failure.
- The view cube is decorative, although working camera presets and framing already exist in `ViewportTools.tsx`.
- Export formats exist, but the File menu offers little help choosing between printing, interoperability, and preserving an editable project.

## Research and design decisions

These are design inferences from the cited official product documentation, applied to FormForge's existing capabilities.

| Product pattern | FormForge decision | Primary source |
| --- | --- | --- |
| A dashboard provides a stable entry point to a modeling product. | Make Projects the home, with obvious New, Import, and Continue actions; keep Community available through navigation. | [Shapr3D dashboard and navigation](https://support.shapr3d.com/hc/en-us/sections/9307597795484-Navigation) |
| Project tiles communicate model identity, editing details, and storage status; sorting supports larger libraries. | Add recognizable previews, search, sorting, recent work, and clear device-local storage language while retaining collections. | [Shapr3D project management](https://support.shapr3d.com/hc/en-us/articles/7873939944476-Access-or-manage-projects-and-folders) |
| Selection and workflow determine which modeling tools are useful. | Divide Build and Sculpt, reveal relevant settings, and retain the existing advanced toolset. | [Shapr3D adaptive interface](https://support.shapr3d.com/hc/en-us/articles/7873882619548-Adaptive-user-interface) |
| Project identity and save/sync status occupy a stable part of the modeling interface. | Show the real saving, saved, or failed state. Say “Saved on this device” and retain an editable download as a backup option. | [Shapr3D modeling space](https://support.shapr3d.com/hc/en-us/articles/7873880676508-Shapr3D-modeling-space) |
| Searchable commands and visible shortcuts help users discover tools and then work faster. | Provide command search and keyboard help backed by existing actions; limit modeling shortcuts to Studio. | [Shapr3D command access](https://support.shapr3d.com/hc/en-us/articles/7378907587484-Accessing-tools), [Onshape keyboard shortcuts](https://cad.onshape.com/help/Content/Home/keyboard_shortcuts_and_hotkeys.htm) |
| Orientation controls navigate the model and reset the view. | Connect the view cube or labeled presets to the existing camera events and expose frame-all/selection controls clearly. | [Shapr3D orientation cube](https://support.shapr3d.com/hc/en-us/articles/7873937480604-Orientation-Cube) |
| Workflow-based controls reduce the number of unrelated decisions on screen. | Explain the first modeling steps in context and organize export choices by purpose using the existing exporters. | [Shapr3D tool access and modes](https://support.shapr3d.com/hc/en-us/articles/7378907587484-Accessing-tools) |

## Persistence implementation

The editor exposes `saveStatus`, `saveError`, `lastSavedAt`, and an awaitable `saveNow()` action. Saving captures the document being edited, debounces each project separately, and serializes writes per project. Switching projects therefore retains the previous project's pending save. Only the current document's latest save request can change its displayed status. Failed saves remain visible and do not block retrying.

Startup restoration is shared across concurrent hydration calls and cannot replace a new/imported document started while storage is loading. A storage read failure is reported without automatically overwriting the inaccessible saved project.

Focused tests cover retaining pending saves across projects, preventing out-of-order writes, suppressing stale success and failure states, reporting autosave failure and retry success, and flushing a manual save without a duplicate delayed write.

## Final validation

Implemented on `codex/formforge-workspace-redesign`:

- A responsive project workshop with actual evaluated model thumbnails, search, sorting, grid/list views, collections, and safe inline deletion.
- A revised light/dark modeling workspace with contextual Build/Sculpt tools, searchable commands, visible shortcuts, a beginner guide, and empty-canvas onboarding.
- A clean Solid result view, optional X-ray outlines, working camera presets and framing that accounts for narrow screens, and accessible inspector controls.
- Honest device-local saving with retry, named checkpoints, editable backups, and independent pending saves when switching projects. Deletion drains issued saves and cancels pending writes so deleted projects stay deleted.
- Export choices with purpose-based explanations and guards against stale geometry or incomplete placement. Multi-color source-part export redirects boolean, hull, and modified models to evaluated 3MF, and material/part resource IDs remain unique.
- A local showcase with labeled sample content, real project previews, and truthful editable-copy availability.

### Checks completed

- `npm.cmd run check`: passed for model, web, and API.
- `npm.cmd test`: **66 passed** across nine test files (38 model, 28 web). Includes persistence ordering/deletion races, document-identity mesh caching, and export regressions.
- `npm.cmd run build`: passed for all workspaces.
- `git diff --check`: passed.
- Browser interaction checks: project search, empty results, sorting, grid/list switching, starter creation, renaming, shape dimensions, placement, canvas selection, undo, Build/Sculpt switching, command search, guide/dialog focus, named checkpoint saving/history, device save after reload, and deletion after reload.
- Visual checks at 1280×720 and 390×844: workshop, editor, mobile panels, light/dark appearance, export chooser, community, and actual showcase preview.
- Compiled production smoke check at `http://127.0.0.1:4173`: workshop loaded; starter evaluated and rendered with 432 triangles and a ready print analysis. This is a local preview, not a public deployment.

### After screenshots

- [Project workshop](ux-evidence/after-projects-light.png)
- [Modeling workspace](ux-evidence/after-studio-light.png)
- [Dark workspace](ux-evidence/after-studio-dark.png)
- [Phone workshop](ux-evidence/after-mobile-projects.png)
- [Phone editor](ux-evidence/after-mobile-studio.png)
- [Phone inspector](ux-evidence/after-mobile-inspector.png)
- [Community](ux-evidence/after-community-light.png)
- [Export chooser](ux-evidence/after-export.png)

### Remaining verification limits

The embedded browser canceled native file downloads after receiving a valid 3MF Blob (5,205 bytes); no downloaded file was delivered in that browser. Export serialization is covered by tests, but end-to-end file delivery still needs a regular browser. Chrome automation was unavailable in this environment.

Vite reports the existing Manifold Node-module browser externalization and a large main bundle (approximately 319 kB gzip). Production geometry rendering passed despite these warnings. No remote deployment, public community backend, or physical print test was performed.
