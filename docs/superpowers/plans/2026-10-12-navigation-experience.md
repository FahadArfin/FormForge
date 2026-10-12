# PrintLab navigation experience

## Intent
The user cannot distinguish Community, Build, Studio, Saved, History and Projects. Redesign existing navigation in place, with clear destinations and consistent access, without changing modeling or stored data.

## Global constraints
Preserve all projects, storage keys, history, cloud auth, existing hash deep links, Site identity and exports. Reuse the existing editor and save-before-replace safeguards. No new dependencies, arbitrary code execution, auth changes or data migration. Existing theme tokens and Lucide icons; responsive and keyboard-accessible. Keep public entry bundle within existing budget. Do not discard unsaved work or remount the editor on area changes. Navigation does not create a new project.

## Task 1: Unified navigation implementation
Implement a shared navigation component on home/templates, Community, Projects and Studio. Three primary destinations in stable order and wording: Community, My projects, Studio. PrintLab brand goes Home with explicit accessible name. Active destination is visibly indicated and aria-current is used. All three destinations remain discoverable on phones using a compact labeled layout or accessible disclosure (no icon-only guessing); no horizontal page overflow. Help/theme controls remain usable. In Studio, keep navigation compact and distinct from project/editor commands. Main destinations must be directly accessible without opening Project actions.

Community secondary navigation: Explore, Bookmarks, My shared designs, Recently viewed. Preserve old page=collections/profile/history routes and saved local data. Explain Bookmarks are community designs saved for later, not editable project files. Replace ambiguous Saved, History, My designs labels in community controls/copy with these clear terms. Keep filtering, tabs, publishing and remix behavior. Templates accessible as a secondary link (not a fourth primary destination).

My projects is the one private project library; remove competing My workshop/Inspiration/main navigation duplicates. Keep its sidebar scoped to project organization: All projects, project collections (label Folders if clearer without renaming data keys), Trash, Recovery copies, Cloud backups & sharing. Add succinct save-location explanation and explicit Resume in Studio current-project action. Community is called Community everywhere, not Inspiration. Cloud remains explicit snapshots and does not imply auto sync. Existing project actions/import/help/starter/recovery/cloud functions remain accessible.

Studio retains Build and Sculpt tools and Engineering workspace; add a short contextual cue that Studio is where you build/edit. Rename visible editor History to Edit history (retain internal tab IDs). Distinguish checkpoint/recovery copy terms. Project actions should contain file/project actions instead of being the only navigation route. Preserve all save guards, document identity, parameters and undo/redo when switching areas. Old links and browser Back/Forward remain functional. Public home prominently offers three purpose-led pathways: browse Community, open My projects, build in Studio. Templates are still accessible, including static template detail pages if they have their own headers (inspect scripts generating them).

Add meaningful regression tests: shared nav destinations/current state; Community subroutes/bookmarks/recent behavior; moving between all three areas and back preserving active document; safe failure on save if applicable; phone nav layout. Update existing tests whose navigation labels legitimately change. Run relevant focused unit tests, npm.cmd run check, then report. Controller runs full tests/build/browser/release. Do not launch a competing browser server or use CUA; controller owns browser QA. No subagents. Commit code/tests as a coherent change on current codex/navigation-experience branch. Do not push/merge/publish.

Report file: .superpowers/sdd/navigation-experience/implementation-report.md. Include status, commits, files, behavior, exact tests/output and concerns. Return compact status.

## Task 2: Validation and release (controller)
Capture current four-screen navigation evidence, review implementation, run tests/build/budget and desktop/phone suites, inspect real UI, fix concrete regressions, independent review, PR/CI/merge, exact-artifact Site publication and live verification. Preserve public URL.
