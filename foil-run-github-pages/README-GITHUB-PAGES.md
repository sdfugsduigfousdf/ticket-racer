# Foil Run — GitHub Pages deploy

## What works on GitHub Pages
- Solo drive / solo scratch (fully client-side)
- Graphics, settings, mobile controls
- Local name / settings in localStorage

## What does **not** work
- Multiplayer rooms, public board, WebRTC signaling  
  (those need `/api/lobbies` and `/api/rtc` on a real server)

## One-time setup

1. Push this repo to GitHub (main or master branch).
2. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
3. Open **Actions** tab → run **Deploy to GitHub Pages** (or just push).
4. After green check, site is at:
   `https://<your-username>.github.io/<repo-name>/`

## Repo name / base path

The workflow sets:

```yaml
BASE_PATH: /${{ github.event.repository.name }}/
```

So if the repo is `foil-run`, assets load from `/foil-run/`.

If you use a **user site** repo named `username.github.io`, edit the workflow and set:

```yaml
BASE_PATH: /
```

## Local static preview

```bash
npm install
npm run build:pages
npx serve .output/public   # or dist, depending on Nitro output
```

## Switching hosts later

| Host | Nitro preset | Command |
|------|--------------|---------|
| GitHub Pages | `static` (default via `build:pages`) | `npm run build:pages` |
| Vercel | `vercel` | `NITRO_PRESET=vercel npm run build` |
| Node / Wasmer | `node` | `NITRO_PRESET=node npm run build` then `npm start` |
