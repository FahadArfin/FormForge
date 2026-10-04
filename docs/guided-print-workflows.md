# Guided print workflows — 4 October 2026

This release implements the eight approved priorities around completing a useful printed part. It preserves the existing parametric, mesh, sculpt and cloud-review tools, while putting linked dimensions and print preparation first.

## What changed and where to find it

| Priority | Delivered behavior | Entry point |
| --- | --- | --- |
| 1. Release quality | Escaped and regenerated geometry-derived SVG previews; XML validation; desktop and phone browser journeys in every GitHub pipeline; application error recovery with editable backup. | Public library, automated validation, recovery screen |
| 2. Semantic templates | Eight recipes expose meaningful dimensions. Walls, bores, floors, lid clearances and openings stay linked. A live draft must build before Apply; one Undo restores the previous dimensions. Direct advanced overrides detach the conflicting binding so they survive reopening. | Template preview or Studio → Model → Make it fit |
| 3. Guided studio | Optional Customize → Check → Export guide, first-model framing, source/result explanation, simpler advanced controls. Check completion expires when geometry or printer settings change. Export completion means a download was requested. | Studio |
| 4. Printer-first preparation | Printer setup and plate placement precede scoped checks; cost is explicitly unconfigured until supplied. Calibration remains optional. Slicer handoff covers Bambu Studio, OrcaSlicer, PrusaSlicer and Cura. | Print panel and Export |
| 5. Durable saving | Device/cloud status, account usage and upload size, lossless snapshot compression, all-version ZIP archive, safe old-version cleanup and conflict backup. Latest and reviewed snapshots are protected; deleting older snapshots permits revision 21 and beyond while retaining at most 20. | Save status → Cloud projects & review |
| 6. Mechanical features | Attached round holes on named box faces/cylinder caps; offsets and blind/through depth; explicit repair state; target-scoped cuts; bounded single box-edge chamfer/fillet prototype; sampled walls and pairwise overlap/clearance. | CAD toolkit → Create; Print → Mechanical checks |
| 7. Phone review | View, Check, Measure, Dimensions and Share are primary. Editing is an explicit mode. Drawers isolate keyboard focus and hide background controls. | Studio at widths up to 980 px |
| 8. Public discovery and print evidence | Eight prerendered `/templates/<id>` pages with unique metadata and sitemap. Five physical measurement protocols, conditions, optional photo, geometry fingerprint and evidence export. | Templates; Print → Physical print record |

## Mechanical behavior and boundaries

Attached holes store a target ID and semantic face, not a triangle index. Resizing or rotating an enabled, unscaled box/cylinder recomputes the hole frame. Offsets are measured from the face center in its documented U/V frame. A missing or incompatible target blocks evaluation and leaves a repairable feature; insertion cannot resolve an orphan against an unrelated destination ID. Reattachment follows the new target's group/assembly scope. Holes are plain cylindrical cuts; the existing standalone hole recipes remain available separately.

The edge prototype treats one complete straight box edge. Chamfers use an analytic clipping plane; fillets use a 96-segment circular construction. Invalid size, scaling, deformation and incompatible modifiers are rejected. Adjacent-corner blends and arbitrary curved edges are outside this prototype. Converting feature-bearing shapes to Polygon Sculpt, mirroring them or recombining attached-hole bodies requires exporting/reimporting the evaluated solid first. Undo and editable backups preserve the original feature source.

Wall checks sample at most 512 triangle centroids, reserving a sample for each connected component. Rays identify a surface entry and its next exit; they do not count air gaps as material. Samples can miss small features and are not a proof of global minimum wall thickness. Pairwise checks measure evaluated overlap volume and minimum mesh gap within the supplied search distance. Both checks accept closed meshes up to 100,000 triangles and 300,000 vertices, run in a cancellable worker and stop after 20 seconds. Results expire when geometry or analysis settings change.

General BRep fillets and exact STEP interchange require a separate kernel integration, stable topology, tolerances and import/export round-trip corpus. The current Manifold triangle kernel does not provide that editable representation. This release deliberately exposes the tested bounded prototype; it does not label mesh exports as STEP. Existing constrained polygon, profile and sketch-dimension tools remain the sketch foundation.

## Storage decisions

New cloud snapshots use a versioned gzip envelope only when it is smaller than raw JSON. Existing uncompressed snapshots remain readable; decompression is bounded to the existing 4 MB request/document cap. Account usage charges actual stored bytes plus upload reservations and pending cleanup. Cleanup never frees quota before object deletion succeeds. Owner-only atomic guards protect the newest snapshot, reviewed snapshots and stale revision writes. Completed deletion invalidates all known local links to the removed snapshot/project.

Shared mesh blobs/content-addressed assets were investigated but not introduced into this release. Safe deduplication needs owner-scoped content hashes, transactional references, orphan cleanup and migration/rollback tests; merely sharing object keys would undermine immutable snapshot deletion. Compression reduces duplication costs without changing permissions or requiring a migration. The 50 MB account, 50 project and 20 retained-version limits are unchanged.

## Physical evidence and diagnostics

The washer, tray, bracket, enclosure and adapter protocols require a real print, dimensions and printer/material/nozzle/layer conditions. Optional PNG/JPEG/WebP photos stay in the project and its explicit backups. Changing the geometry, printer or measurement draft invalidates the confirmation. Records are self-reported, and historical geometry is identified. **No physical prints were made during this release; public templates remain physically unverified.**

Diagnostics are off by default. Enabling them keeps at most 100 local records for build/import/export outcome and duration, time to first editable model, completed same-session template-to-export journeys and UI errors. No model data, filenames, account details, error text or automatic uploads are recorded. Turning the feature off erases its log. Export success measures download initiation, not a completed print or verified file save.

## Validation and performance

The local full suite passes 389 tests (42 model + 347 web), with model/web/API/cloud type checks and production build validation. The regression corpus covers every attachment face, blind depth, target-only cuts, edge volumes, invalid persisted feature bounds, orphan imports, grouping guards, sub-epsilon walls, contact/overlap/gap, template reopening/dependency edits, compressed legacy snapshots, cleanup quotas and retention at revision 21.

GitHub CI additionally runs Chromium at desktop and phone sizes through template → dimensions → Undo → saved reopen → actual 3MF download, invalid-dimension recovery, modal focus restoration, malformed import recovery, all SVG loads and all prerendered template routes. Browser failures retain screenshots/traces. The validated `dist` artifact is the release input after main passes.

Manual in-app browser checks used 1440 × 960 and 390 × 844. They verified clear geometry, working dimensions, sampled-wall results, phone overflow, drawer isolation and slicer handoff. Evidence screenshots are in `docs/guided-print-workflows/`. These are emulated viewport checks, not physical-phone hardware certification or a new user-satisfaction score. Cloud concurrency/storage tests use the real SQL/API implementation with an in-memory database/object fixture; authenticated hosted account writes are not claimed as tested by these fixtures.

The [benchmark report](benchmarks/2026-10-04-geometry.json) records the machine/runtime and exclusions. Warm kernel medians on this desktop were 32.5 ms for the enclosure, 10.6 ms for the coupon, 49 ms for 20,480 triangles and 590.2 ms for 204,020 triangles. Sampled wall checks took 37, 14.9 and 547 ms respectively; the 204k mesh correctly exceeded the wall-check limit. These timings exclude browser rendering, worker transfer, mobile hardware and network load. The public entry keeps its 300 KiB raw / 100 KiB gzip JavaScript gate. Capacity for thousands of concurrent users requires separate service load and field measurements.

## Research references

- [Manifold JavaScript API](https://manifoldcad.org/docs/jsuser/classes/Manifold.html): mesh operations, ray queries and minimum-gap primitives; implemented against the installed package's types and real WASM fixtures.
- [Prusa modeling guidance](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135): walls and mating-part clearances depend on printer, orientation and process. Physical measurement remains separate from geometric checks.
