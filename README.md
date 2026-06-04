# PickleFlow

Pickleball platform — tournaments, open play, dashboard, and player profiles.

## Quick start

1. Double-click **`Start Pickleflow.bat`**
2. Open **http://localhost:3000**

## Trial links

| Page | URL |
|------|-----|
| Home | http://localhost:3000 |
| Player login | http://localhost:3000/login |
| Register | http://localhost:3000/register |
| Dashboard | http://localhost:3000/dashboard |
| Open play | http://localhost:3000/open-play |
| Tournaments | http://localhost:3000/tournament |

## Supabase (real login — turn off demo mode)

See **`SUPABASE_SETUP.md`** for step-by-step setup (Supabase + Vercel env vars).

Without Supabase keys, login/register use **demo mode** (email only, no real passwords).

## Fix applied

- Tailwind CSS wired up (styles now load)
- `@/` import path alias
- Tournaments sidebar link fixed (`/tournament`)
- Supabase client with demo fallback
- Startup batch file
