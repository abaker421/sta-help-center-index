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
  Assistant project (see README). Do NOT hand-edit `sw.js`: the build script
  (`build-react-app.py`) regenerates it on every run and stamps the `CACHE`
  constant as `sta-hc-<unix-timestamp>` (from `int(time.time())` at build time).
  Re-sync the whole `dist/` output, not just `index.html`, so the new cache key
  ships with it and clients pick up the build.
- The key is a per-BUILD timestamp, not a per-day date, and must stay that way.
  Two deploys on the same calendar day are routine here; a date-only key like
  `sta-hc-YYYYMMDD` would emit an identical value for the second build, so the
  service worker would keep serving the first build's cached assets to anyone who
  already had the PWA installed - a silent staleness bug with no error to notice.

## Branching (main is protected - PR only)

`main` is protected: direct pushes are rejected. **Never run `git push origin main`.**

1. `git checkout main && git pull origin main` - start from an up-to-date main
2. `git checkout -b <type>/<slug>` - branch BEFORE staging, so local `main` never diverges
3. edit, then `git add -- <explicit paths>` - never `git add -A`
4. `git commit -m "<message>"`
5. `git push -u origin <branch>`
6. `gh pr create --base main --fill`
7. `gh pr checks <branch> --watch` - wait for the required checks
8. `gh pr merge <branch> --squash --delete-branch`
9. `git checkout main && git pull origin main`

Never merge while a required check is failing or pending, and never disable a check to
force a merge through - stop and report instead.

Cloudflare Pages is Git-connected to `main`, so the deploy happens on merge, not on push.

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
