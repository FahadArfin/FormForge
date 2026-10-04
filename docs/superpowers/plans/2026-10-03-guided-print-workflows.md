# Guided print workflows implementation plan

**Goal:** Turn the approved eight-priority UX audit into a validated public FormForge release.
**Architecture:** Extend the existing document, parameter, worker, local recovery and cloud snapshot systems. Keep editing reversible; label bounded CAD checks and physical evidence honestly.
**Tech stack:** React, TypeScript, Zustand, Three.js, Manifold, Dexie, D1/R2, Vitest, browser CI.
**Spec:** User-approved audit, `.audit/next-priorities-2026-10-04/index.html`.

## Global constraints

- Work on `codex/guided-print-workflows`; push every commit through CI, open and merge a green PR, publish the exact main artifact to the existing public Site.
- Preserve existing projects, undo, imports, sculpting, parameter editing, sharing permissions and anonymous public access.
- Never claim physical prints, device hardware tests, general STEP support or universal wall validation without evidence.
- Research delegation is read-only and bounded; the Site owner integrates and releases all code.

## Review focus

Geometry correctness, recipe validity, stale asynchronous results, cloud concurrency/quota cleanup, schema compatibility, accessible dialogs/mobile controls, routing metadata, real browser acceptance.

## Tasks, in priority order

- [x] 1. Validate SVG assets and fix the coupon title. Add release browser journeys and error recovery checks; retain entry budget.
- [x] 2. Add versioned semantic template definitions, named parameters and linked dimensions for eight templates; implement customizer with validity/presets and single-action undo. Test linked geometry and persistence.
- [x] 3. Add persistent optional Customize → Check → Export guidance based on real actions, selected-part context, first-model framing and simpler beginner controls.
- [x] 4. Reorder print review around printer, placement, scoped checks and 3MF/slicer handoff. Make unconfigured costs explicit; optional advanced preparation.
- [x] 5. Add unified local/cloud backup status, preflight quota usage, safe old-version removal and conflict recovery. Evaluate compressed/content-addressed storage without unsafe migrations.
- [x] 6. Implement stable supported-face hole references and repair states, bounded mechanical checks, and a tested chamfer/fillet feasibility path. Document kernel/STEP constraints.
- [x] 7. Focus phone review on view, dimensions, checks and sharing; place editing behind an explicit action and verify responsive controls.
- [x] 8. Add real public template detail paths, metadata and instructions; create honest measured print-test recording/export workflow with five task protocols.
- [x] Cross-cutting. Add actionable app recovery and opt-in local diagnostics without model contents; run representative bounded geometry performance fixtures.
- [ ] Verify. Unit/type/build/browser checks, independent review, GitHub PR and CI, exact-artifact public Sites deployment and live verification.

## Validation

Add regression tests before meaningful new behavior. Run focused tests during implementation, then full typecheck/unit/build and entry budget. Use browser CI for repeatable user journeys and the in-app browser for visual acceptance. Record limitations and final release evidence in a release note.

## Engineering rulings

- The user has approved this design and release process; no additional approval gate is needed.
- General selected-edge BRep fillets and exact STEP interchange remain feasibility work unless proven by a supported kernel; do not expose a misleading success action.
- A recorded print test is user-supplied evidence with measurements and conditions; templates begin as physically unverified.

Implementation and local validation: see `docs/guided-print-workflows.md`. Final GitHub/main pipeline and public deployment evidence will be reported after release.
