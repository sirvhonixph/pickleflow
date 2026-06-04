# Deploy PickleFlow to Vercel

PickleFlow is a Next.js app and deploys cleanly on Vercel’s **Hobby (free)** plan for personal projects.

## Is Vercel free?

Yes, for hobby/personal use:

- **$0/month** on the [Hobby plan](https://vercel.com/docs/plans/hobby)
- Good for demos and small clubs
- Limits include ~**100 GB bandwidth/month**, **1M function invocations**, and **4 CPU-hours**
- **Not for commercial production** — upgrade to Pro if this is a paid product

That is enough for a pickleball tournament app with moderate traffic.

## Important: data storage

Locally, PickleFlow saves data to `data/pickleflow-store.json`.

On Vercel, the server filesystem is **read-only**, so the app uses **Vercel Blob** in production when `BLOB_READ_WRITE_TOKEN` is set. On first run it seeds from `data/pickleflow-store.json` in the repo if the blob is empty.

## Step 1 — Push code to GitHub

1. Install [Git](https://git-scm.com/download/win) if needed.
2. Create a new repo on GitHub (e.g. `pickleflow`).
3. In PowerShell:

```powershell
cd C:\Users\ADMIN\Pickleflow
git init
git add .
git commit -m "Initial PickleFlow deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pickleflow.git
git push -u origin main
```

Commit includes your tournament data in `data/pickleflow-store.json` so the first deploy can seed it.

## Step 2 — Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and sign up (GitHub login is easiest).
2. Click **Add New → Project**.
3. Import your `pickleflow` GitHub repo.
4. Framework preset should auto-detect **Next.js**.
5. Leave build settings as default:
   - Build command: `npm run build`
   - Output: (default)

## Step 3 — Add Blob storage (required for saves)

1. In the Vercel project, open **Storage** tab.
2. Click **Create Database** → choose **Blob**.
3. Name it (e.g. `pickleflow-blob`) and connect it to this project.
4. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically — no manual copy needed.

Without Blob, the site will load but **creating events / saving scores will not persist**.

## Step 4 — Optional Supabase env vars

If you later connect Supabase auth, add in **Settings → Environment Variables**:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |

These are optional today — login works with local demo users without Supabase.

## Step 5 — Deploy

Click **Deploy**. Vercel builds and gives you a URL like:

`https://pickleflow-xxxxx.vercel.app`

Every push to `main` redeploys automatically.

## Deploy from CLI (alternative)

```powershell
npm i -g vercel
cd C:\Users\ADMIN\Pickleflow
vercel login
vercel
```

Follow prompts, then add Blob storage in the dashboard and run:

```powershell
vercel --prod
```

## Verify after deploy

1. Open the Vercel URL → Dashboard loads.
2. Create a test open-play event → refresh → it should still be there.
3. Open Simon Cup → tournament data should appear (seeded from repo on first request).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Events disappear after refresh | Blob not connected; add Blob storage and redeploy |
| Build fails | Run `npm run build` locally, fix errors, push again |
| 503 / paused | Hobby plan limit hit; wait for reset or upgrade |

## Local development

No Blob token needed locally — the app keeps using `data/pickleflow-store.json`.

Copy `.env.example` to `.env.local` only if using Supabase or testing Blob locally.
