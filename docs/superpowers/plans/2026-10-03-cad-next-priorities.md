# CAD next priorities implementation plan

**Goal:** Implement roadmap priorities 11–20 for beginner/intermediate printed-part workflows and release the validated result publicly.

**Architecture:** Extend the existing editable document, local project persistence, toolkit panels, Three viewport, and Manifold workers. Keep optional document fields backward compatible. Public CAD remains usable without an account; cloud review is an optional, authenticated service with explicit sharing. The Site owner implements and integrates; bounded research/review agents return findings.

**Spec:** `docs/CAD_WORKFLOW_PRIORITIES.md`, priorities 11–20. The separately listed advanced modeling roadmap is outside this continuation.

**Constraints:** Millimeters remain canonical. Preserve undo, locks, Boolean groups, materials, source history, and older projects. Reject unsupported operations visibly. Bound input, image, mesh, comment, and cloud payload sizes. Never claim measured fit, slicer accuracy, or popularity. Follow the authorized feature branch → every-commit CI → PR/merge → successful main artifact → public Sites release.

## Ordered implementation

- [x] 11. Persistent XY/XZ/YZ/offset and picked-face workplanes; plane-local sketch/primitive placement and visible plane. Validate right-handed frames, coordinate roundtrip, and arbitrary-face placement.
- [x] 12. Pick a face and rigidly orient a selected assembly onto the plate; preserve relative transforms and drop by evaluated bounds. Test compound/signed scales, locks, stale snapshots, and unsupported sculpt/binding cases.
- [x] 13. Bounded editable emboss/deboss text using a redistributable bundled font; retain text parameters in the project and regenerate mesh on edit. Validate counters, caps, finite geometry, and updates.
- [x] 14. Local raster underlays with opacity, plane placement, two-point calibration, visibility/removal, persistence, and no manufacturing export. Bound decoded image size and stale uploads.
- [x] 15. Insert editable local projects; remap node/group/material/parameter IDs and formula names without collisions; preserve Boolean order and group isolation. Fail ambiguous global sculpt insertion.
- [x] 16. Contact alignment with gap plus selected-assembly linear/polar patterns with explicit origins. Bound counts, respect locks, preserve groups, and clarify copies are independent.
- [x] 17. Editable configurable enclosure/lid/boss, bracket, adapter, and snap-fit calibration recipes. Validate dimensions and final real Boolean geometry; no universal fit guarantees.
- [x] 18. Pinned distances, three-point angles, visible dimension annotations, and explicit stale-geometry state. Persist data and suppress stale canvas dimensions.
- [x] 19. Saved printer/material profiles and bounded material cost estimation with visible assumptions. Provide supported model-file handoff to external slicers; no invented slicing result.
- [x] 20. Optional authenticated cloud projects, snapshot sharing and threaded review; accessible guided tasks; opt-in local onboarding metrics with clear/reset controls. Verify identity, ownership, authorization, revision conflicts, sharing revocation, and bounded requests on the hosted path.

## Review and release

- [x] Focused behavioral and real-geometry tests; full check/test/build.
- [x] Independent review of geometry and hosted boundaries; resolve findings.
- [x] Browser acceptance on desktop and narrow layout, including upload/calibration and cloud failure states.
- [ ] Commit/push each batch and verify its pipeline; PR/merge and main CI.
- [ ] Publish exact validated artifact; verify successful public deployment.

## Decisions

- Continue within the user's existing implementation and release authorization; no repeated design approval gate.
- Implement in the roadmap's dependency order. Research of independent later tasks may overlap.
- Cloud accounts must be real authenticated identities, never a local display-name masquerading as an account.
- Existing checkpoint and export workflows remain the recovery/handoff paths.
