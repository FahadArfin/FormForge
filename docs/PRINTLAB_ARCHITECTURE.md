# PrintLab architecture and compatibility

PrintLab extends FormForge in place. The React/TypeScript application is built with Vite; Three.js renders the existing editor and isolated proposal preview. Zustand owns the document, selection and undo/redo. This is constructive, mesh-evaluated CAD, not a boundary-representation mechanical CAD kernel.

## Reused systems

- **Model:** packages/model owns schemaVersion 1 documents, primitives, sketches, groups, assemblies, formulas, named parameters and bindings. Existing declarative code-first generation remains restricted; engineering plans never execute generated JavaScript.
- **Geometry:** manifold-3d WASM runs in workers. evaluateSnapshot creates isolated, cancellable evaluations with timeouts. Every engineering operation resolves its parameters and evaluates a candidate before the next operation. Empty/invalid geometry and excessive complexity are rejected.
- **Editor:** the existing viewport, selection, tools, measurements, sculpting and generation remain available under Modeling. Engineering uses the same document and a separate preview, followed by one replace-document transaction.
- **History:** undo/redo and checkpoints remain the recovery system. Split operations disclose mesh conversion and require a saved checkpoint before committing.
- **Persistence:** Dexie database formforge retains projects, versions, collections and recovery. Version 5 adds per-project engineering plans. Optional engineering and slicerResult document metadata round-trip with existing editable projects and cloud snapshots; legacy documents need neither field.
- **Cloud:** the Sites Worker serves the public application and authenticated cloud snapshots. Existing routes and identity boundaries remain intact. It does not provide hosted AI inference.
- **Local services:** Fastify retains optional local integrations. An administrator may enable a loopback-only OpenAI-compatible model adapter. The public site never connects to localhost.
- **Generation:** local recipes, relief generation and optional TRELLIS image-to-mesh are retained. Mesh generation is distinct from editable engineering plans.
- **Printing:** existing mesh checks, Mesh Doctor, placement, section splitting, and geometry-only STL/3MF exports are reused. Imported slicer metadata is explicitly associated by the user and becomes stale when relevant geometry, printer or material inputs change.

## Proposal boundary

document.modelContext exposes six top-level Site tools when supported: read design, submit plan, preview plan, preview status, discard plan and read findings. No tool applies changes. The visible Apply control commits an accepted preview. Runtime validation uses the same versioned Zod contract for tools, local-model output and edited plans.

Plans retain requirements, unresolved questions, assumptions, expected checks and allowlisted operations. Unresolved questions block evaluation. Intervening edits/project switches invalidate the captured source. Cancellation, timeouts and failures leave the source unchanged. Plans and provenance stay local with the project; no credentials or authentication tokens are included.

## Geometry and engineering limitations

Rack shelf dimensions are explicit measurements, not inferred from nominal rack size. Features retain stable IDs and named dimension bindings. Supported rounding is primitive box rounding; arbitrary edge fillets are unsupported. Orienting documents with attached holes or rotation bindings is currently rejected rather than breaking their constraints. Each primitive exposes only supported operation fields, and parameter combinations requiring silent kernel clamping are rejected. Mesh splitting loses parametric editability in the candidate while retaining source recovery.

Findings distinguish deterministic geometry checks, sampling/geometry heuristics and unverified AI suggestions. Hole checks require supported feature metadata; imported meshes require selected measurements. Sampled thickness is not a proven global minimum. Orientation compares bounded candidates using fit, contact and overhang, not an exhaustive optimization. Material volume estimates are not slicing estimates.

P1S dimensions are nominal. Configurable bed exclusions and slicer constraints still apply. Slicer metadata imports do not execute G-code, run a slicer, control a printer or establish print success. Time stays unknown without recognized source metadata; cost requires identified mass and entered pricing.

## Compatibility and naming

Application-facing text is PrintLab. Internal formforge database/preference/event names, @formforge package identifiers, API paths, schemaVersion 1, snapshot encoding markers, project IDs and .forge.json extensions remain deliberately unchanged. GitHub repository and public URL are unchanged. Historical audits and release records keep their original FormForge attribution.

Baseline before changes: 46 model + 452 web tests passed; type checks and production build passed. Subsequent validation and release evidence are recorded in PRINTLAB_IMPLEMENTATION.md. Physical fit, strength, thermal behavior and actual print success remain unverified.
