create table profiles (
    id uuid primary key default gen_random_uuid(),
    first_name text,
    last_name text,
    email text unique,
    phone text,
    dupr_id text,
    dupr_rating numeric(3,2),
    created_at timestamp default now()
);

create table events (
    id uuid primary key default gen_random_uuid(),
    title text,
    description text,
    event_type text,
    location text,
    registration_fee numeric,
    start_date timestamp,
    created_by uuid,
    created_at timestamp default now()
);

create table registrations (
    id uuid primary key default gen_random_uuid(),
    player_id uuid,
    event_id uuid,
    payment_status text,
    created_at timestamp default now()
);

create table courts (
    id uuid primary key default gen_random_uuid(),
    event_id uuid,
    court_number integer,
    status text
);

create table matches (
    id uuid primary key default gen_random_uuid(),
    court_id uuid,
    team_a text,
    team_b text,
    score_a integer default 0,
    score_b integer default 0,
    status text,
    created_at timestamp default now()
);

create table tournaments (
    id uuid primary key default gen_random_uuid(),
    event_id uuid,
    category text,
    format text,
    created_at timestamp default now()
);

create table payments (
    id uuid primary key default gen_random_uuid(),
    player_id uuid,
    event_id uuid,
    amount numeric,
    payment_method text,
    payment_status text,
    created_at timestamp default now()
);

create table notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid,
    title text,
    message text,
    is_read boolean default false,
    created_at timestamp default now()
);