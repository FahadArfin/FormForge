# FormForge

FormForge is a local-first, browser-based 3D modeler built around playful shape editing and reliable printable mesh output. It combines click-drag primitive creation, additive/subtractive modeling, parametric loft/gear/spring/rounded-box features, safe code-first CAD, image relief generation, optional TRELLIS.2 image-to-3D, direct polygon sculpting, a WebAssembly manifold geometry engine, print checks, local checkpoint history, and broad mesh interchange.

## Run locally

Requirements: Node.js 22.12 or later.

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`. The editor works without the API and saves projects directly in the browser.

## Verify

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

## Self-host

Copy `.env.example` to `.env`, replace every secret, then run:

```powershell
docker compose up --build
```

Open `http://localhost:8080`. Geometry processing remains on the client; PostgreSQL backs optional project sync and version/share endpoints.

## Interaction

- The workshop opens to your projects, with real model previews, search, sorting, collections, and an editable starter example.
- Use **Build** to create shapes and **Sculpt** for surface tools. Start with the **Getting started** guide if you are new to modeling.
- Pick a solid or carve primitive, then click-drag on the build plane to draw its footprint.
- Select a feature in the viewport or model list, then drag the body or move/rotate/scale handles. Choose a snap step in the viewport toolbar; arrow keys nudge by that step, `Shift` moves 10×, and `Alt` moves 0.1×.
- In Pro mode, draw polygon profiles and press `Enter` to extrude them, or build mirror and linear patterns from the inspector.
- Switch between **Edit shapes** and **Solid result** to inspect the evaluated boolean model.
- Toggle the build plane off for a free-space view, frame all or the selection, and use X-ray outlines to locate hidden features.
- Paint Add, Carve, or localized Smooth strokes. Radius, strength, spacing, falloff, and X symmetry are adjustable; `[` and `]` resize the brush.
- Open **Generate** for chat-to-parametric CAD, local private image reliefs, optional TRELLIS.2 image-to-3D, or the safe declarative CAD console.
- Import STL, OBJ, GLB, or editable project JSON from the workshop or Project actions. The **Export** chooser explains 3MF, STL, OBJ, GLB, editable backups, and multi-color parts. Mesh exports wait for the current geometry and completed placement.
- The project header reports real device-local saving and errors. Click the save status or press `Ctrl/Cmd+S` to save immediately. Keep a separate editable backup for recovery.
- Save named local checkpoints from **Project actions** beside the project name; restore them from the **History** tab.
- Find actions with `Ctrl/Cmd+K`. Use `V`, `G`, `R`, and `S` to select, move, rotate, and scale; `F` frames the model and `Shift+F` frames the selection. `?` opens help.
- Use `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Ctrl/Cmd+D`, and `Delete` for common editing operations.

The Community page is a local showcase with labeled inspiration examples. Collections, reactions, and your showcase entries remain in this browser; this interface does not publish to a public service. Only entries with an attached project can provide an editable copy or download.

Research, design decisions, and before/after evidence are in [`docs/UX_REDESIGN.md`](docs/UX_REDESIGN.md).

## Current scope

This repository delivers a substantial browser-modeling application with a real boolean mesh engine and print-oriented workflow. An optional exact OCCT service, full nonlinear sketch solving, STEP/XDE assemblies, production GPU queues/object storage, and advanced face/edge topology editing remain deeper engineering tracks; the document and worker boundaries are designed for those additions.

The clean-room feature analysis and architecture map for the requested CAD systems is in [`docs/CAD_RESEARCH.md`](docs/CAD_RESEARCH.md).

## Optional TRELLIS.2

TRELLIS.2 is a 4B-parameter single-image-to-3D model; it does not consume the chat prompt directly. The official local implementation requires Linux, CUDA, and an NVIDIA GPU with at least 24 GB VRAM. FormForge keeps this integration off by default. Configure a private compatible Space or opt into the quota-limited Microsoft Hugging Face Space in `.env`, then restart Docker. Uploaded images are sent to that configured provider only after the user clicks **Generate with TRELLIS.2**. Local Relief never uploads the image.
