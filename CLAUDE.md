# CLAUDE.md - sta-help-center-index

See @README.md for what this project is.

Internal article-index portal for School Technology Associates support staff: a
single-file React app (Babel Standalone, no build step) that organizes Salesforce
Knowledge links, internal articles, and email templates by product into tabs.
Installable PWA.

## Run / test
- No build step. Serve over HTTP so the service worker registers:
  `npx serve .` (or any static server), then open the printed URL.
- Opening `index.html` via `file://` will NOT register the service worker.

## Deploy
- Cloudflare Pages, Git-connected: pushing to `main` auto-deploys. No build step
  (static); build output directory is the repo root (`/`). The Pages project is
  configured in the Cloudflare dashboard, NOT in this repo - there is no deploy
  workflow here. Access is gated to `@k12sta.com` via Cloudflare Zero Trust
  (Google Workspace SSO).
- This repo holds the DEPLOYED copy; the editable source lives in the Help Center
  Assistant project (see README). After re-syncing `index.html`, bump the `CACHE`
  constant in `sw.js` (`sta-hc-YYYYMMDD`) so clients pick up the new build.

## Branching (main is protected)
`main` is protected - direct pushes are rejected. Branch, commit, push, open a
PR, then squash-merge once CI is green. Never run `git push origin main`.

## File organization (root is locked)
Do not add files to the repo root unless required. Only `index.html`,
`manifest.json`, `sw.js`, `README.md`, `CLAUDE.md`, and `.gitignore` (plus other
dotfiles) belong at root. Before creating any new file: 1) identify which folder
it belongs in, 2) create it if missing, 3) add it there.
- New icon -> `icons/`; new CSS -> `css/`; new JS -> `js/`.

## Do not touch
- `sw.js` MUST stay at the repo root - a service worker only controls its own URL
  path and below, so moving it into a subfolder silently shrinks its scope.
- Do NOT add a `_redirects` file with `/* /index.html 200` - Cloudflare Pages
  rejects the wildcard SPA fallback (`[code: 10021] Infinite loop detected`).
  This app has no client-side routing; `/` serves `index.html` naturally.
