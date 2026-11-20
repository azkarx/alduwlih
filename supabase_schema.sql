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
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

update public.user_profiles
set name = case role
  when 'admin' then 'محمد رضا'
  when 'manager' then 'داليا محمد'
end
where role in ('admin', 'manager')
  and name is distinct from case role
    when 'admin' then 'محمد رضا'
    when 'manager' then 'داليا محمد'
  end;

create index if not exists idx_movements_created_at on public.movements (created_at desc);
create index if not exists idx_movements_item_id on public.movements (item_id);
create index if not exists idx_allocations_customer on public.customer_allocations (customer_id);
create index if not exists idx_allocations_item on public.customer_allocations (item_id);

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

alter table public.items enable row level security;
alter table public.customers enable row level security;
alter table public.customer_allocations enable row level security;
alter table public.movements enable row level security;
alter table public.warehouse_settings enable row level security;
alter table public.user_profiles enable row level security;

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
  public.user_profiles
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.items,
  public.customers,
  public.customer_allocations,
  public.movements,
  public.warehouse_settings
to authenticated;
grant select on table public.user_profiles to authenticated;

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
