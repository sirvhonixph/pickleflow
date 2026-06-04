# Turn off Demo Mode — Supabase login for PickleFlow

Demo mode means **no real passwords** — only email checks. Follow these steps once to enable **email + password** login on **www.pickleflow.online**.

---

## Step 1 — Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New project**.
3. Pick a name (e.g. `pickleflow`), set a **database password** (save it somewhere safe), choose a region close to you.
4. Wait until the project is **Active** (a few minutes).

---

## Step 2 — Allow login without email confirmation (recommended for testing)

1. In Supabase, open **Authentication** → **Providers** → **Email**.
2. Turn **OFF** “Confirm email” (or “Enable email confirmations”).
3. Save.

(You can turn confirmations back on later for production.)

---

## Step 3 — Run the database script

1. In Supabase, open **SQL Editor** → **New query**.
2. Open this file on your PC: `database/supabase-auth-setup.sql`
3. Copy all of it, paste into Supabase, click **Run**.
4. You should see **Success**.

---

## Step 4 — Copy your API keys

1. In Supabase, go to **Project Settings** (gear) → **API**.
2. Copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string under “Project API keys”)

---

## Step 5 — Add keys to Vercel (live website)

1. Go to [vercel.com](https://vercel.com) → project **pickleflow** (not project-5ollg).
2. **Settings** → **Environment Variables**.
3. Add these two (check **Production**, **Preview**, and **Development**):

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |

4. Click **Save**.
5. Go to **Deployments** → on the latest deployment click **⋯** → **Redeploy** → confirm.

Wait until status is **Ready** (~2 minutes).

---

## Step 6 — Add keys on your PC (optional, for local testing)

1. In `C:\Users\ADMIN\Pickleflow`, copy `.env.example` to `.env.local` (if you don’t have `.env.local` yet).
2. Paste the same two values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

3. Restart the app (`Start Pickleflow.bat`).

---

## Step 7 — Supabase site URL (important for production)

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL:** `https://www.pickleflow.online`
3. **Redirect URLs** — add:
   - `https://www.pickleflow.online/**`
   - `http://localhost:3000/**`
4. Save.

---

## How to know it worked

Open **https://www.pickleflow.online/login**

- You should **not** see “Demo mode”.
- You should see **email + password** fields.
- Register a **new** test account (old demo-only accounts do not have a Supabase password).

---

## Notes

- **Old demo users:** They exist in PickleFlow data but not in Supabase Auth. They must **register again** with a password (same email may work if not already in Supabase).
- **Tournaments/events** still use Vercel Blob for data — keep Blob connected in Vercel (you already did this).
- **Do not** put your database password or service_role key in Vercel — only the two `NEXT_PUBLIC_*` variables above.
