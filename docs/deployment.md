# Deployment

## Platform

Vercel, project `lnanhkhoas-projects/nobita-house-3d` (account `lnanhkhoa`).

## URL

https://nobita-house.vercel.app (production alias; also
`nobita-house-3d-lnanhkhoas-projects.vercel.app`). `nobita-house-3d.vercel.app` is not
assigned to this project and returns 404.

Preview deployments sit behind Vercel Authentication: open them while logged in to
Vercel, or `curl` gets a 302 to the SSO page.

## Deploy command

```bash
vercel whoami        # must print lnanhkhoa; if not: vercel logout && vercel login
vercel --prod        # production
vercel               # preview deployment
```

Build settings live in [vercel.json](../vercel.json): `bun install`, `bun run build`, output `dist/`.
`public/models/*` is served with a one-day cache.

## What gets uploaded

[.vercelignore](../.vercelignore) keeps `.env`, `assets/` (reference art and raw
Rodin exports), `shots/`, `plans/`, `docs/`, `scripts/`, `node_modules/` and
`dist/` out of the upload. The build only needs `src/`, `public/` and the root
config files.

## Environment variables

None. The app reads no env vars at runtime. `GEMINI_API_KEY` in `.env` is only for
local asset scripts and must never be uploaded.

## Git integration

Not connected. The origin remote uses an SSH host alias
(`git@github-personal:...`), which the Vercel CLI cannot parse. To deploy on
every push, connect `lnanhkhoa/nobita-house-3d` in the Vercel dashboard under
Project → Settings → Git.

## Rollback

```bash
vercel ls                        # list deployments
vercel rollback <deployment-url> # promote an earlier deployment
```
