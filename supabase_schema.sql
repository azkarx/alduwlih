-- ============================================================================
-- إدارة مخزن الدولية — Supabase schema with authenticated, role-based access
-- ============================================================================

create table if not exists public.items (
  id text primary key,
  sku text unique not null,
  barcode text not null default '',
  name text not null,
  category text not null default 'عام',
  unit text not null default 'قطعة',
  color text not null default '',
  size_spec text not null default '',
  rack text not null default '-',
  physical_stock integer not null default 0 check (physical_stock >= 0),
  min_threshold integer not null default 0 check (min_threshold >= 0),
  photo_path text,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items
  add column if not exists photo_path text;

create table if not exists public.customers (
  id text primary key,
  code text unique not null,
  name text not null,
  phone text default '',
  contact_person text default '',
  production_line text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_allocations (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  item_id text not null references public.items(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique(customer_id, item_id)
);

create table if not exists public.movements (
  id text primary key,
  type text not null,
  item_id text not null,
  item_name text not null,
  item_sku text not null,
  unit text not null default 'قطعة',
  quantity_delta integer not null,
  before_stock integer not null,
  after_stock integer not null,
  person_name text not null,
  counterparty_type text,
  counterparty_id text,
  counterparty_name text,
  source text,
  notes text default '',
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.movements
  add column if not exists photo_path text;

create table if not exists public.warehouse_settings (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  participant_key text primary key check (participant_key in ('mohamed', 'dalia')),
  user_id uuid not null unique references public.user_profiles(id) on delete cascade
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.chat_participants(user_id),
  recipient_id uuid not null references public.chat_participants(user_id),
  body text not null check (char_length(body) <= 4000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

insert into public.chat_participants (participant_key, user_id)
select 'mohamed', p.id
from public.user_profiles p
where p.role = 'admin'
  and p.active
  and (
    select count(*) = 1
    from public.user_profiles matching
    where matching.role = 'admin'
      and matching.active
  )
on conflict (participant_key) do nothing;

insert into public.chat_participants (participant_key, user_id)
select 'dalia', p.id
from public.user_profiles p
where p.role = 'manager'
  and p.active
  and (
    select count(*) = 1
    from public.user_profiles matching
    where matching.role = 'manager'
      and matching.active
  )
on conflict (participant_key) do nothing;

create or replace function public.register_private_chat_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active
    and new.role = 'admin'
    and (
      select count(*) = 1
      from public.user_profiles p
      where p.role = 'admin'
        and p.active
    )
  then
    insert into public.chat_participants (participant_key, user_id)
    values ('mohamed', new.id)
    on conflict (participant_key) do nothing;
  end if;

  if new.active
    and new.role = 'manager'
    and (
      select count(*) = 1
      from public.user_profiles p
      where p.role = 'manager'
        and p.active
    )
  then
    insert into public.chat_participants (participant_key, user_id)
    values ('dalia', new.id)
    on conflict (participant_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.register_private_chat_participant() from public, anon, authenticated;
drop trigger if exists register_private_chat_participant on public.user_profiles;
create trigger register_private_chat_participant
  after insert or update of role, active on public.user_profiles
  for each row execute function public.register_private_chat_participant();

create index if not exists idx_movements_created_at on public.movements (created_at desc);
create index if not exists idx_movements_item_id on public.movements (item_id);
create index if not exists idx_allocations_customer on public.customer_allocations (customer_id);
create index if not exists idx_allocations_item on public.customer_allocations (item_id);
create index if not exists idx_chat_messages_sender_created_at
  on public.chat_messages (sender_id, created_at desc);
create index if not exists idx_chat_messages_recipient_created_at
  on public.chat_messages (recipient_id, created_at desc);
create index if not exists idx_chat_messages_unread
  on public.chat_messages (recipient_id, created_at desc)
  where read_at is null;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and p.active
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.role = 'admin'
  );
$$;

revoke all on function public.current_user_is_active() from public, anon;
revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

create or replace function public.current_chat_peer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select peer.user_id
  from public.chat_participants mine
  join public.user_profiles mine_profile
    on mine_profile.id = mine.user_id
  join public.chat_participants peer
    on peer.participant_key <> mine.participant_key
  join public.user_profiles peer_profile
    on peer_profile.id = peer.user_id
  where mine.user_id = (select auth.uid())
    and mine_profile.active
    and peer_profile.active
    and (
      (
        mine.participant_key = 'mohamed'
        and mine_profile.role = 'admin'
        and peer.participant_key = 'dalia'
        and peer_profile.role = 'manager'
      )
      or (
        mine.participant_key = 'dalia'
        and mine_profile.role = 'manager'
        and peer.participant_key = 'mohamed'
        and peer_profile.role = 'admin'
      )
    )
  limit 1;
$$;

create or replace function public.current_user_is_chat_participant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_chat_peer_id() is not null;
$$;

create or replace function public.get_chat_peer()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select peer_profile.id, peer_profile.name
  from public.chat_participants mine
  join public.user_profiles mine_profile
    on mine_profile.id = mine.user_id
  join public.chat_participants peer
    on peer.participant_key <> mine.participant_key
  join public.user_profiles peer_profile
    on peer_profile.id = peer.user_id
  where mine.user_id = (select auth.uid())
    and mine_profile.active
    and peer_profile.active
    and peer.user_id = (select public.current_chat_peer_id())
  limit 1;
$$;

revoke all on function public.current_chat_peer_id() from public, anon;
revoke all on function public.current_user_is_chat_participant() from public, anon;
revoke all on function public.get_chat_peer() from public, anon;
grant execute on function public.current_chat_peer_id() to authenticated;
grant execute on function public.current_user_is_chat_participant() to authenticated;
grant execute on function public.get_chat_peer() to authenticated;

alter table public.items enable row level security;
alter table public.customers enable row level security;
alter table public.customer_allocations enable row level security;
alter table public.movements enable row level security;
alter table public.warehouse_settings enable row level security;
alter table public.user_profiles enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Allow anon full access to items" on public.items;
drop policy if exists "Allow anon full access to customers" on public.customers;
drop policy if exists "Allow anon full access to allocations" on public.customer_allocations;
drop policy if exists "Allow anon full access to movements" on public.movements;
drop policy if exists "Allow anon full access to settings" on public.warehouse_settings;

drop policy if exists "Active users can read items" on public.items;
drop policy if exists "Admins can manage items" on public.items;
drop policy if exists "Active users can read customers" on public.customers;
drop policy if exists "Admins can manage customers" on public.customers;
drop policy if exists "Active users can read allocations" on public.customer_allocations;
drop policy if exists "Admins can manage allocations" on public.customer_allocations;
drop policy if exists "Active users can read movements" on public.movements;
drop policy if exists "Admins can manage movements" on public.movements;
drop policy if exists "Active users can read settings" on public.warehouse_settings;
drop policy if exists "Admins can manage settings" on public.warehouse_settings;
drop policy if exists "Users can read permitted profiles" on public.user_profiles;

revoke all on table
  public.items,
  public.customers,
  public.customer_allocations,
  public.movements,
  public.warehouse_settings,
  public.user_profiles,
  public.chat_participants,
  public.chat_messages
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.items,
  public.customers,
  public.customer_allocations,
  public.movements,
  public.warehouse_settings
to authenticated;
grant select on table public.user_profiles to authenticated;
grant select on table public.chat_messages to authenticated;
grant insert (sender_id, recipient_id, body) on table public.chat_messages to authenticated;
grant update (read_at) on table public.chat_messages to authenticated;

create policy "Active users can read items" on public.items
  for select to authenticated using ((select public.current_user_is_active()));
create policy "Admins can manage items" on public.items
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

create policy "Active users can read customers" on public.customers
  for select to authenticated using ((select public.current_user_is_active()));
create policy "Admins can manage customers" on public.customers
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

create policy "Active users can read allocations" on public.customer_allocations
  for select to authenticated using ((select public.current_user_is_active()));
create policy "Admins can manage allocations" on public.customer_allocations
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

create policy "Active users can read movements" on public.movements
  for select to authenticated using ((select public.current_user_is_active()));
create policy "Admins can manage movements" on public.movements
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

create policy "Active users can read settings" on public.warehouse_settings
  for select to authenticated using ((select public.current_user_is_active()));
create policy "Admins can manage settings" on public.warehouse_settings
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

create policy "Users can read permitted profiles" on public.user_profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.current_user_is_admin())
  );

drop policy if exists "Chat participants can read the private conversation" on public.chat_messages;
drop policy if exists "Chat participants can send messages to their peer" on public.chat_messages;
drop policy if exists "Chat recipients can mark messages read" on public.chat_messages;

create policy "Chat participants can read the private conversation" on public.chat_messages
  for select to authenticated
  using (
    (select public.current_user_is_chat_participant())
    and (
      sender_id = (select auth.uid())
      or recipient_id = (select auth.uid())
    )
  );

create policy "Chat participants can send messages to their peer" on public.chat_messages
  for insert to authenticated
  with check (
    (select public.current_user_is_chat_participant())
    and sender_id = (select auth.uid())
    and recipient_id = (select public.current_chat_peer_id())
  );

create policy "Chat recipients can mark messages read" on public.chat_messages
  for update to authenticated
  using (
    (select public.current_user_is_chat_participant())
    and recipient_id = (select auth.uid())
    and read_at is null
  )
  with check (
    (select public.current_user_is_chat_participant())
    and recipient_id = (select auth.uid())
    and read_at is not null
  );

drop policy if exists "Chat participants can read private realtime presence" on realtime.messages;
drop policy if exists "Chat participants can publish private realtime presence" on realtime.messages;

create policy "Chat participants can read private realtime presence" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() = 'warehouse-chat-presence'
    and (select public.current_user_is_chat_participant())
  );

create policy "Chat participants can publish private realtime presence" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() = 'warehouse-chat-presence'
    and (select public.current_user_is_chat_participant())
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication supabase_realtime was not found.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'warehouse-movement-photos',
  'warehouse-movement-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active users can read warehouse movement photos" on storage.objects;
drop policy if exists "Admins can upload warehouse movement photos" on storage.objects;
drop policy if exists "Admins can update warehouse photos" on storage.objects;

create policy "Active users can read warehouse movement photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'warehouse-movement-photos'
    and (select public.current_user_is_active())
  );

create policy "Admins can upload warehouse movement photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'warehouse-movement-photos'
    and (select public.current_user_is_admin())
  );

create policy "Admins can update warehouse photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'warehouse-movement-photos'
    and (select public.current_user_is_admin())
  )
  with check (
    bucket_id = 'warehouse-movement-photos'
    and (select public.current_user_is_admin())
  );
