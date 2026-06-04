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

## Supabase (optional)

Copy `.env.example` to `.env.local` and add your Supabase URL and anon key.  
Run `database/schema.sql` in the Supabase SQL editor.

Without Supabase, login/register work in **demo mode** (local storage).

## Fix applied

- Tailwind CSS wired up (styles now load)
- `@/` import path alias
- Tournaments sidebar link fixed (`/tournament`)
- Supabase client with demo fallback
- Startup batch file
