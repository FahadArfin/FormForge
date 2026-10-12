# PrintLab conversational studio extension

User intent: chat inside the studio, choose a model, connect a ChatGPT account, and generate/refine editable geometry with WebMCP compatibility.

## Design and compatibility
Extend the current Engineering workspace. Keep schema-validated plans, isolated geometry preview, UI-only Apply, undo, checkpoints, existing project data and existing public URL. Conversation text stays in a separate bounded per-project local store, outside exported model documents. No API key provisioning.

The official Sign in with ChatGPT docs (checked 2026-10-12) allow dynamic registration and plan usage for local/open-source runtimes; remotely hosted service eligibility is separate. Implement actual loopback OAuth for locally running PrintLab, account-specific models and Responses streams, with protected server-side credentials. Public Sites uses the existing browser-mediated ChatGPT connection: queue typed requests, expose conversation via tools, receive responses/plans, show explicit waiting-for-ChatGPT state and copy handoff. Never imply a queued request automatically wakes ChatGPT or a Site identity token grants inference. Model choice for Site tools belongs to adjacent ChatGPT.

## Milestones
1. Local ChatGPT OAuth, session security, model catalog, bounded structured inference; integration tests using fake endpoints only.
2. Project-scoped assistant conversation, message/request IDs, contextual handoff, schema-validated replies and stale-response rejection; WebMCP read/reply/select tools.
3. Native chat interface, provider/model/account controls, examples/refinements, cancellation, statuses and local persistence. Keep measured recipe and existing plan review.
4. Review, full tests/typecheck/build/budget, desktop/phone browser and supported WebMCP checks. Publish reviewed exact artifact through existing Site workflow.

## Risks and acceptance
OAuth requires user consent and eligible account: do not perform consent automatically. Test cryptographic validation and transport with mocked provider fixtures; label live sign-in/inference unverified until a user completes it. Tokens never enter browser storage, project documents, exports, logs or tools. Host/origin checks and CSRF bind local authorization; loopback callback is separate from public-site hosting. Cross-project requests and changed designs cannot apply late replies. No arbitrary code execution or programmatic Apply tools.

## Execution ledger
Ruling: proceed under the explicit request to implement; no repeated design approval. Reuse the attached clean worktree on codex/printlab-chat-studio. Public account-backed remote inference remains gated on platform eligibility, not simulated.

## Running direct account-backed chat locally

Use Node 22.12+ and the existing workspace setup. In PowerShell from the repository:

```powershell
npm.cmd ci
$env:ENGINEERING_CHATGPT_ENABLED='true'
$env:ENGINEERING_UI_ORIGIN='http://localhost:5173'
npm.cmd run dev
```

Open exactly `http://localhost:5173/#studio`, choose **Ask AI**, select **My ChatGPT account**, then **Continue with ChatGPT** and **Open secure ChatGPT sign-in**. Complete the official OpenAI consent page yourself. Return to PrintLab and refresh the connection if needed. The model picker lists the selected account's current catalog, without inventing model access. Choose a model, type your design, answer measurement questions, then preview and explicitly Apply.

The API does not automatically load `.env.example`; export environment variables or use your process manager. For a different browser URL set `ENGINEERING_UI_ORIGIN` to that exact loopback origin. The Vite dev proxy sends `/api` to port 8787. The public Site cannot use this local API.

Credentials live only in API memory. Restarting the API requires sign-in again. A stable host ID and validated account/client mappings, **without access, refresh or ID tokens**, persist in `~/.printlab/`. Returning sign-in reuses the saved registration. Disconnect attempts remote revocation; if it cannot confirm revocation, use ChatGPT Settings to disconnect PrintLab. Account and plan eligibility, workspace policy and usage limits are determined by OpenAI.

For an installed local model, keep the existing `ENGINEERING_LOCAL_ENABLED`, `ENGINEERING_LOCAL_URL` and `ENGINEERING_LOCAL_MODEL` configuration and choose **Installed local model**. Both direct transports support 128 parametric features, bounded conversation context and explicit Apply. Mesh buffers are excluded and the UI explains this; use the inspector for mesh measurements.

## Public Site workflow

Open the published Site in the supported ChatGPT desktop browser and select **Ask AI**. Queue a request, then ask the adjacent ChatGPT conversation to **read my pending PrintLab request**. Pick the model in ChatGPT. Queuing alone does not wake the adjacent agent. Use **Copy request for ChatGPT** for an explicit handoff. The registered tools now include `printlab_read_conversation`, `printlab_reply_to_request` and `printlab_select_features` in addition to existing design/preview/findings tools. Replies bind to the request, project, revision and exact source document. Changed, cancelled and superseded requests cannot replace newer work. No tool commits geometry.

Conversation history persists separately in IndexedDB schema v6, bounded to 80 messages and 100,000 serialized characters. Exported model documents do not include chat or credentials. Failed or corrupted transcript reads are quarantined to prevent overwriting saved history. Responses and plans use plain text rendering, not generated HTML.

## Protocol sources (checked 2026-10-12)

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Site tools](https://learn.chatgpt.com/docs/webmcp)

## Verification ledger

- 49 shared-model tests, 546 web tests, 26 local API tests passed (621 total).
- Type checks, production build and entry-budget checks passed; all 34 desktop/phone browser tests passed, including typed-request reload recovery, invalid replies, preview, Apply, undo/redo, cancellation and fixture-backed account model selection.
- Actual local browser WebMCP discovery, request read/reply and isolated geometry preview were exercised through the supported browser. Public release verification is performed after publication.
- Independent review corrected transcript-load, fresh-project recovery, canonical reload fingerprints, OAuth-generation, model-refresh and mesh-context edge cases; no remaining blockers reported.
- Real ChatGPT OAuth consent and account-funded inference have not been performed by the agent. Mock-provider tests validate cryptographic token checks, account isolation, refresh, response completion, cancellation, bounded parsing and token exclusion. This is implementation verification, not proof of account eligibility or a completed real inference request.
