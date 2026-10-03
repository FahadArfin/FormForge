# FormForge competitive workflow review

Reviewed October 3, 2026 against public version 3 and source `e04fd420`. Audience: beginners and intermediate makers designing functional printed parts. This is a task-based expert review, not a customer study or a formal accessibility certification.

## Verdict

The existing CAD capabilities are useful, but discovery and the journey from an imported or starter model to a trustworthy export remain uneven. Heuristic assessment before this release: website 6.5/10, studio workflow 7/10. These subjective scores are not evidence of market preference or capacity. The strongest opportunities are fewer dead ends, explicit scale/scope, reversible visual focus, and recovery.

## Captured journey

1. **Workshop — usable, limited starts.** Clear local-save messaging, search and collections. Only blank and generic-demo entry points; useful functional recipes are buried in the studio. [Screenshot](competitive-review-2026-10-03/01-workshop-before.png).
2. **Community — misleading emphasis.** The local-preview disclaimer is present, but illustrated concepts and sample popularity counts dominate a model-library presentation. [Screenshot](competitive-review-2026-10-03/02-community-before.png).
3. **Concept details — dead end.** The sample cannot be downloaded or remixed; its primary action creates a blank document. The explanation appears below the large image and action. [Screenshot](competitive-review-2026-10-03/03-inspiration-detail-before.png).
4. **Studio entry — capable, low discoverability.** At the current 969-pixel width the inspector is a drawer; newer CAD tools sit behind its generic toolkit entry. Source and result modes need clear context when parts overlap. [Screenshot](competitive-review-2026-10-03/04-studio-before.png).
5. **Command search — confirmed failure.** Searching “text” returns no commands despite an implemented text tool. Disabled actions disappear, preventing users from learning their prerequisites. [Screenshot](competitive-review-2026-10-03/05-command-search-before.png).
6. **Print preparation — partial confidence.** The panel explains slicing limits and material assumptions, but checks model dimensions rather than actual placement within the bed. [Screenshot](competitive-review-2026-10-03/06-print-checks-before.png).
7. **Export — scope mismatch risk.** Scope and format are explicit, but the readiness summary remains tied to the whole model; selected geometry is only evaluated during download. Recommended 3MF cannot be imported back. [Screenshot](competitive-review-2026-10-03/07-export-before.png).
8. **Phone — workable with discovery risks.** The canvas remains usable and controls reflow. Compact icons and drawers make finding less common operations harder. [Screenshot](competitive-review-2026-10-03/08-phone-before.png).

Source inspection additionally found permanent local project deletion, reload choosing the most recently edited rather than last-opened project, and an Apply material action that can incorrectly refresh stale slicer results. These are source findings, distinct from the captured interactions above.

## Competitor evidence

- [Tinkercad's official getting-started guide](https://damassets.autodesk.net/content/dam/autodesk/www/pdfs/tinkercad-getting-started-guide.pdf) emphasizes starter learning activities and everyday navigation/visibility controls. Its public project pages were also inspected; dynamically unavailable contents were not treated as observed editor behavior.
- [Shapr3D tool access](https://support.shapr3d.com/hc/en-us/articles/7378907587484-Accessing-tools) combines search, selection context and direct access. [STL units](https://support.shapr3d.com/hc/en-us/articles/7874502103068-STL-units) explains why unitless meshes need explicit interpretation. [Export](https://support.shapr3d.com/hc/en-us/articles/7874524196764-Export) makes scope, hidden items and units explicit.
- [Onshape isolation](https://cad.onshape.com/help/Content/View/isolate.htm) provides temporary focus for occluded geometry. [Feature basics](https://cad.onshape.com/help/Content/PartStudio/feature_basics.htm) explains contextual help and invalid-input feedback.
- [PrusaSlicer arrangement](https://help.prusa3d.com/article/auto-arrange-tool_1770) treats print layout and spacing as a distinct workflow. [3MF projects](https://help.prusa3d.com/article/saving-projects-as-3mf_1773) distinguishes geometry exchange from a complete slicing project.

These sources support the workflow choices below. They do not establish feature parity, customer demand, or legal/physical manufacturing suitability.

## Additions in implementation order

| Order | Addition | Acceptance |
| --- | --- | --- |
| 1 | Complete CAD command discovery | Search text/workplanes/recipes/variants/materials and synonyms; open the exact tool; explain disabled actions. |
| 2 | Import review and core 3MF | Confirm unit interpretation, proportional size and up axis before insertion; bounded files and geometry; imported 3MF geometry preserves declared units and build transforms. |
| 3 | Scope-correct export | Evaluate the chosen scope before enabling download; show its dimensions and included sources; visible-only scope preserves whole Boolean groups; never revalidate stale slicer data without fresh input. |
| 4 | Useful editable starters | A searchable starter chooser makes actual recipe geometry, dimensions and next steps available from the workshop; distinguish illustrative concepts from editable files and remove synthetic popularity emphasis. |
| 5 | Temporary focus and overlap selection | Isolate complete selected assemblies without changing the document; exit restores prior display; overlap list uses visible source hit targets; reveal selected in the inspector. |
| 6 | Placement checks and print report | Detect evaluated geometry outside bed bounds, below bed or floating; provide appropriate actions and export a plain-language report with limits. |
| 7 | Export-only plate arrangement | Preview bounded rectangular packing of disconnected evaluated mesh components with a chosen gap; refuse overflow; export without mutating the designed assembly. |
| 8 | Named camera views | Save, restore, rename/remove bounded camera bookmarks with project backups; reject invalid poses. |
| 9 | Recoverable local deletion | Trash retains project and checkpoints; restore reverses removal; permanent deletion requires explicit confirmation. |
| 10 | Correct project resume | Record last-opened locally, use it on reload with safe fallback, and remove stale references when a project is trashed. |

## Design and verification boundaries

Keep FormForge's existing purple/neutral visual system. Add task-oriented entry points and concise status explanations rather than another large toolbar. Use real model previews for starter parts and print arrangement. Preserve source IDs, parameters, undo, cloud snapshots, and old editable backups. Imports and export preparation may be cancelled and must not overwrite a document changed while work was running.

Behavioral tests cover data loss and geometry boundaries; browser checks cover command destinations, starter creation, import confirmation, focus/exit, export layout, recovery, and narrow screens. Screenshots alone do not verify keyboard/screen-reader completeness. Software checks do not prove physical fit, a full slicer project, or multi-user load capacity.

## Implemented outcome and acceptance

All ten additions above are implemented. Command discovery covers the CAD panels, primitive shapes, profile drawing, sculpt brushes and selected-shape modifiers, with reasons for unavailable actions. Four editable starters (enclosure, bracket, adapter and snap-fit pair) use the real Boolean engine. The inspiration gallery removes synthetic popularity emphasis and routes its main action to these starters.

Verified in a local browser at desktop and 390px phone widths:

- A unitless one-unit STL previews at 25.40 mm after choosing inches; cancellation leaves the model intact. A core 3MF with declared inch units imports at 25.40 mm automatically.
- Selecting the enclosure lid previews its complete three-feature group at 80 × 50 × 5 mm, compared with 170 × 50 × 25 mm for the full assembly.
- Arranging the two evaluated solids gives 163 × 50 × 25 mm with 3 mm spacing, clears the bed-position warning and leaves the editor geometry unchanged.
- Solid-result picking, temporary isolation and the overlap chooser work; the latter distinguishes the lid, locating lip and cavity at the same pointer location.
- Camera bookmarks survive reload. Moving the test project to Trash and restoring it preserves its checkpoint. Reload resumes that project even after a newer project was created.
- Export controls reflow on a phone with an accessible persistent download action. A browser download request was observed; the embedded browser did not return a download-completion event, so browser-level file delivery is not claimed. Automated serialization tests cover the export bytes.

Evidence: [starter preview](competitive-review-2026-10-03/09-starters-after.png), [selected export](competitive-review-2026-10-03/11-selected-export-after.png), [unit review](competitive-review-2026-10-03/12-import-review-after.png), [phone handoff](competitive-review-2026-10-03/13-phone-export-after.png), [studio](competitive-review-2026-10-03/14-studio-after.png). Intermediate screenshots may precede final spacing refinements.

Independent review identified and resolved source-picking regression, stale export rendering, STL/GLTF allocation declarations, mismatched STL format sniffing, dishonest ZIP expansion metadata, duplicate GLB JSON chunks, and cancellation during starter saving. Import preflight now checks allocations before loaders; streamed ZIP extraction counts actual output.

The revised workflow is substantially easier to discover and recover. I assess it at approximately 8/10 for this beginner/intermediate workflow, subject to real user testing. A credible 9/10 requires observing beginners complete tasks and assessing performance with representative devices and large models; this release does not establish preference among thousands of users.

## Practical limits

- 3MF import is geometry-only core format with one model, declared units and component/build transforms. Unsupported required extensions and external model resources fail visibly; textures, print profiles and supports are not imported. Mesh files are capped at 25 MB, 500,000 triangles and 1.5 million vertices; expanded model XML is capped at 32 MB.
- Plate arrangement translates up to 64 disconnected solids / 100,000 triangles into footprint rows, with no rotation or optimal-packing claim. Enclosed cavity shells are refused instead of being separated incorrectly. Use a slicer for dense or complex layouts.
- Print checks use overall bounds and position, not local wall analysis or physical certification. There is no G-code, STEP/BRep kernel, real-time shared editing or load-test claim.
- Trash stays on this device, retains checkpoints and has no automatic purge. Clearing browser storage still removes local data. Keep editable backups or cloud snapshots.

## Release validation

Final local validation passed: complete type checks; 313 tests (42 model and 271 web); production build and packaged public-asset checks. Independent review closed with no remaining important findings. The final [print workflow screenshot](competitive-review-2026-10-03/15-final-print-workflow.png) shows the accepted layout and updated checks. GitHub validation and publication are tracked by the release PR.
