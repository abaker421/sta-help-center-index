# STA Help Center Index

Internal article-index portal for School Technology Associates support staff. Single-file React app (Babel Standalone, no build step) that organizes Salesforce Knowledge article links, internal articles, and email templates by product into tabs.

## Hosting

- **Platform:** Cloudflare Pages (migrated from Netlify, 2026-06-01)
- **Deploy model:** Git-connected — pushes to `main` auto-deploy
- **Build command:** none (static)
- **Build output directory:** `/` (repo root)
- **Access:** Cloudflare Zero Trust, gated to `@k12sta.com` via Google Workspace SSO

## Files

| File | Purpose |
|------|---------|
| `index.html` | The entire app + embedded `window.HC_DATA` |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker (offline cache) |
| `icons/` | PWA icons (192 / 512) |

## Source of truth

This repo holds the **deployed** copy. The editable source lives at:

`C:\Users\Adam\Documents\Claude\Projects\STA Projects\Help Center Assistant\article-index\HC-Index-App.html`

After editing the source, re-sync `index.html` here (see that project's `MAINTENANCE.md`), bump the `CACHE` constant in `sw.js` to `sta-hc-YYYYMMDD`, commit, and push. Cloudflare auto-deploys.

## Important: no `_redirects` file

Do **not** add a `_redirects` file with `/* /index.html 200`. Cloudflare Pages rejects the wildcard SPA fallback with `[code: 10021] Infinite loop detected`. This app has no client-side routing — every tab is in-page state, and `/` serves `index.html` naturally. The `_redirects` file from the Netlify deploy was intentionally dropped during migration.
