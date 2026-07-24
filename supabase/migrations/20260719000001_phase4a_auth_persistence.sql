-- Phase 4a: auth + owner-scoped core persistence.
-- Person-ref columns (paid_by, person_id, from/to_person_id, actor_id) are plain
-- uuids with NO FK: the app has a flat person-id namespace (profile + contacts).
-- Hard person FKs arrive in Phase 4c (expense_participants).

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  avatar text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'avatar', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- friends (contacts, NOT accounts) ----------
create table public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text not null default '',
  avatar text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index friends_owner_idx on public.friends (owner_id);

-- ---------- groups ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  avatar text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index groups_owner_idx on public.groups (owner_id);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  person_id uuid not null,
  primary key (group_id, person_id)
);

-- ---------- expenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  paid_by uuid not null,
  date timestamptz not null default now(),
  category text not null default 'other',
  currency text not null default 'USD',
  group_id uuid references public.groups(id) on delete set null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index expenses_owner_idx on public.expenses (owner_id);
create index expenses_group_idx on public.expenses (group_id);

create table public.expense_payers (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  person_id uuid not null,
  amount numeric(12,2) not null,
  primary key (expense_id, person_id)
);

create table public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  person_id uuid not null,
  amount numeric(12,2) not null,
  primary key (expense_id, person_id)
);

-- ---------- settlements ----------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  from_person_id uuid not null,
  to_person_id uuid not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  date timestamptz not null default now(),
  group_id uuid references public.groups(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index settlements_owner_idx on public.settlements (owner_id);

-- ---------- activity_events (append-only audit log) ----------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  group_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_owner_idx on public.activity_events (owner_id, created_at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.friends enable row level security;
create policy "friends_own" on public.friends
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.groups enable row level security;
create policy "groups_own" on public.groups
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.group_members enable row level security;
create policy "group_members_via_parent" on public.group_members
  for all
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

alter table public.expenses enable row level security;
create policy "expenses_own" on public.expenses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.expense_payers enable row level security;
create policy "expense_payers_via_parent" on public.expense_payers
  for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()));

alter table public.expense_splits enable row level security;
create policy "expense_splits_via_parent" on public.expense_splits
  for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()));

alter table public.settlements enable row level security;
create policy "settlements_own" on public.settlements
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.activity_events enable row level security;
create policy "activity_events_own" on public.activity_events
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
