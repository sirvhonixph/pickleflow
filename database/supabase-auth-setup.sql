-- Run this in Supabase: SQL Editor → New query → Run
-- Sets up profiles + security for PickleFlow login (email + password)

create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    first_name text,
    last_name text,
    email text unique,
    phone text,
    dupr_id text,
    dupr_rating numeric(3,2),
    category text,
    created_at timestamptz default now()
);

-- If profiles already exists from an older schema, add missing column:
alter table profiles add column if not exists category text;

alter table profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on profiles;
create policy "Profiles are viewable by everyone"
  on profiles for select
  using (true);

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);
