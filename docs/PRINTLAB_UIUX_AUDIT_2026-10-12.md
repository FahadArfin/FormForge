# PrintLab UI/UX audit and repair — 2026-10-12

## Scope and evidence
Current production v11, commit 506bc06, inspected in the Codex browser at desktop, 1440×960 and 390×844. Current-run screenshots live in the primary workspace `.audit/uiux-2026-10-12/`. Reviewed landing, template library/detail, workshop, cloud entry, recovery, inspiration/detail, studio Build/Sculpt/Pro, assistant, engineering, generation, help and export. Authenticated account consent and physical printing are outside this visual audit. Existing data and modeling behavior remain intact. This is a bounded audit of observed defects, not a claim of exhaustive accessibility certification.

## Issue and solution register
| ID | Priority | Observed issue | Solution | Evidence |
|---|---|---|---|---|
| U01 | High | AI workflow absent from landing | Add truthful AI entry and three-step explanation; route into existing Engineering workspace | 05 |
| U02 | Medium | Mixed violet/teal action identity across pages | Unify semantic accent tokens and states in both themes | 02,08,19 |
| U03 | High | Dark-mode AI actions and badges have low contrast | Remove late hardcoded accent override; use theme-aware tokens | 21 |
| U04 | Medium | Public pages ignore theme and lack theme control | Shared persisted appearance control and matching public dark surfaces | 04,05 |
| U05 | Medium | Template detail omits mark and skip link | Reuse consistent brand/skip navigation | 04 |
| U06 | Medium | Repeated template links have identical names | Include template name in accessible CTA labels | 03 |
| U07 | High | Illustration detail shows sample Boost 906, download-based sorting and untested print claims | Remove invented social proof; factual concept descriptions and local-only controls | 08,09 |
| U08 | Medium | Community name implies hosted social service | Label navigation Inspiration; preserve route/storage identifiers | 02,08 |
| U09 | Medium | Floating mobile theme button obscures detail actions | Place theme control in normal header flow | 10 |
| U10 | Medium | Mobile two-column project names truncate almost completely | Single-column compact project cards at narrow phone widths | 11 |
| U11 | High | Saved model is cropped on load/viewport changes | Fit initial geometry once; preserve user view during edits; verify aspect changes | 12,17 |
| U12 | Medium | Four studio navigation bands consume phone canvas | Compact phone mode controls and guide; preserve accessible entry points | 12 |
| U13 | High | Assistant composer falls below panel fold; nested scroll regions | Bound message area and keep composer reachable with responsive panel layout | 13,21 |
| U14 | High | ChatGPT handoff hidden until after queueing | Always-visible short handoff guidance; explicit submit label and pending status | 13,21 |
| U15 | Medium | Chat displays raw status strings and generic heading after messages | Human status labels, contextual heading, keyboard/send guidance | 13,21 |
| U16 | High | Engineering width CSS loses to general workspace rules | Correct specific layout selectors; adequate assistant/inspector width | 21 |
| U17 | High | Hole selectors contain indistinguishable names | Include stable index/position context in option labels, full-width selectors | 21 |
| U18 | Medium | Long findings bury print setup and orientation | Summary counts, compact disclosure details, direct section navigation | 21,22 |
| U19 | Medium | Tiny 9–11px critical labels/actions | Raise readable UI typography and touch target sizes where observed | 13,21 |
| U20 | Medium | Export fit warnings lack path to correct printer/placement | Add explicit return-to-print-setup action preserving export state as practical | 14 |
| U21 | Medium | Generate dialog very tall with large unused region | Content-driven dialog height while keeping long-content scrolling | 15,16 |
| U22 | Medium | Getting-started help omits AI and hides basic controls | Add current AI workflow and direct task navigation; correct CAD toolkit wording | 20 |
| U23 | Medium | Cloud sign-in can be mistaken for AI model access | Explain cloud-project sign-in purpose at sign-in entry | 06 |
| U24 | Medium | Recovery action labels repeat without project/revision context | Accessible labels include project and revision; sticky modal header | 07 |

## Global constraints
Extend existing React editor only. Preserve all IDs, APIs, schemas, local/cloud data and preference keys. No generated fake social metrics, no invented AI access, no geometry mutation without existing preview/apply. Keep keyboard focus/escape behavior. Add meaningful regression tests. Existing public URL and audience stay unchanged. User explicitly authorizes audit, all observed fixes and release; no further design approval is required.

## Implementation outcome
All U01–U24 have been implemented in the existing application. The fixes retain the editor, APIs, project formats, database and preference keys, local-first storage and the current deployment URL.

Public pages now lead into the real AI workflow, share the saved appearance, expose distinct template links and use consistent identity. Inspiration explicitly describes concept illustrations and local collections; sample popularity counts and unsupported print claims have been removed. Phone project cards preserve readable names, while recovery controls identify their project and revision.

The studio now frames evaluated geometry after the canvas mounts and updates the camera aspect before resize handling. The phone assistant has a reachable composer, explicit ChatGPT handoff, human-readable statuses and less duplicate navigation. Engineering checks have a summary, section shortcuts, distinguishable hole choices and expandable evidence. Export warnings link back to printer settings, and generation dialogs size to their content.

Independent review caught three additional dark-theme omissions and two help/drawer lifecycle defects. These were corrected: active links, focus rings and demo labels use theme tokens; workshop help opens the phone assistant after navigation; changing drawer content rebinds the focus trap. Follow-up review passed both specification and code-quality checks.

## Verification
Baseline: web suite 547 tests and repository type checks passed before changes. Added regressions cover public appearance and AI entry, recovery context, honest concept metadata, chat statuses, hole labels, camera aspect and saved-project framing. Browser coverage includes the public AI entry, phone composer, inspector shortcuts, workshop help, export correction route and drawer keyboard lifecycle, alongside existing CAD, export/import, persistence and undo/redo flows.

Final local gates passed: repository type checks; 49 shared-model, 555 web and 26 API tests (630 total); production build; entry budget 218,284 raw / 69,745 gzip bytes; and 41 desktop/phone browser checks. One desktop invocation is intentionally skipped because it checks a phone-only drawer lifecycle; that check passes in the phone suite. No browser tests failed. The release proceeds through GitHub CI and publication of these exact built assets; live deployment evidence is reported with the release. Current-run before/after captures are retained in `.audit/uiux-2026-10-12/` in the primary workspace. Capture 01 is excluded because its saved image was incomplete. Authenticated cloud-account consent, direct account-funded inference, physical fit and actual printing are not claimed by this audit.


Representative after captures: `after-engineering-desktop-final.jpg`, `after-chat-phone-final.jpg`, `after-project-cards-phone.jpg`, `after-templates-phone-dark-final.jpg` and `after-generate-desktop-final.jpg`. The final generator is centered at 940 × 663 px in a 1440 × 960 viewport. Phone public navigation uses a 137 px two-row header at 390 px width. All registered fixes are implemented; no observed audit issue remains open.
