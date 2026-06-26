create table if not exists public.invoices (
  id text primary key,
  company_id text not null default 'msg',
  invoice_type text not null check (invoice_type in ('issued', 'received')),
  operation_type text not null,
  invoice_number text not null,
  series text,
  access_key text,
  issue_date date not null,
  entry_date date,
  exit_date date,
  party_name text not null,
  party_cnpj text,
  party_ie text,
  city text,
  state text,
  nature_operation text,
  main_cfop text not null,
  purpose text,
  payment_condition text,
  payment_method text,
  due_date date,
  pf_value numeric(14, 2) not null default 0,
  carrier_name text,
  payment_date date,
  paid boolean not null default false,
  status text not null,
  category text,
  cost_center text,
  total_products numeric(14, 2) not null default 0,
  freight_value numeric(14, 2) not null default 0,
  total_invoice numeric(14, 2) not null default 0,
  icms_base numeric(14, 2) not null default 0,
  icms_value numeric(14, 2) not null default 0,
  icms_credit_value numeric(14, 2) not null default 0,
  pis_base numeric(14, 2) not null default 0,
  pis_value numeric(14, 2) not null default 0,
  pis_credit_value numeric(14, 2) not null default 0,
  cofins_base numeric(14, 2) not null default 0,
  cofins_value numeric(14, 2) not null default 0,
  cofins_credit_value numeric(14, 2) not null default 0,
  cfem_base numeric(14, 2) not null default 0,
  cfem_rate numeric(8, 4) not null default 0,
  cfem_value numeric(14, 2) not null default 0,
  tax_benefit text,
  legal_basis text,
  additional_info text,
  internal_notes text,
  xml_file_name text,
  pdf_file_name text,
  has_linked_operation boolean not null default false,
  linked_operation_type text,
  linked_invoice_number text,
  final_recipient_name text,
  physical_receiver_name text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists pf_value numeric(14, 2) not null default 0;

alter table public.invoices
  add column if not exists carrier_name text;

create table if not exists public.linked_operations (
  id text primary key,
  company_id text not null default 'msg',
  operation_type text not null,
  main_invoice_id text,
  linked_invoice_id text,
  main_invoice_number text not null,
  linked_invoice_number text,
  supplier_name text,
  final_recipient_name text,
  final_recipient_cnpj text,
  physical_receiver_name text,
  physical_receiver_cnpj text,
  main_cfop text,
  linked_cfop text,
  main_access_key text,
  linked_access_key text,
  operation_date date,
  amount numeric(14, 2) not null default 0,
  status text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id bigint generated always as identity primary key,
  invoice_id text references public.invoices(id) on delete cascade,
  file_type text,
  file_name text,
  file_url text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.parties (
  id text primary key,
  kind text not null check (kind in ('customer', 'supplier', 'carrier')),
  name text not null,
  cnpj text,
  ie text,
  city text,
  state text,
  address text,
  phone text,
  email text,
  category text,
  plate text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fiscal_settings (
  id text primary key default 'default',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id text primary key,
  item_type text not null,
  item_name text not null,
  acquisition_date date not null,
  acquisition_value numeric(14, 2) not null default 0,
  plate text,
  registration_number text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop table if exists public.allowed_users cascade;


create index if not exists invoices_type_date_idx on public.invoices(invoice_type, issue_date);
create index if not exists invoices_cfop_idx on public.invoices(main_cfop);
create index if not exists invoices_party_idx on public.invoices(party_name);
create index if not exists linked_operations_status_idx on public.linked_operations(status);
create index if not exists parties_kind_name_idx on public.parties(kind, name);
create index if not exists assets_archived_type_idx on public.assets(archived, item_type);

alter table public.invoices replica identity full;
alter table public.linked_operations replica identity full;
alter table public.parties replica identity full;
alter table public.fiscal_settings replica identity full;
alter table public.assets replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'linked_operations'
  ) then
    alter publication supabase_realtime add table public.linked_operations;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parties'
  ) then
    alter publication supabase_realtime add table public.parties;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fiscal_settings'
  ) then
    alter publication supabase_realtime add table public.fiscal_settings;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assets'
  ) then
    alter publication supabase_realtime add table public.assets;
  end if;
end $$;

alter table public.invoices enable row level security;
alter table public.linked_operations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.attachments enable row level security;
alter table public.parties enable row level security;
alter table public.fiscal_settings enable row level security;
alter table public.assets enable row level security;

revoke all on table public.invoices from anon;
revoke all on table public.linked_operations from anon;
revoke all on table public.parties from anon;
revoke all on table public.fiscal_settings from anon;
revoke all on table public.assets from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.attachments from anon;

grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.linked_operations to authenticated;
grant select, insert, update, delete on table public.parties to authenticated;
grant select, insert, update, delete on table public.fiscal_settings to authenticated;
grant select, insert, update, delete on table public.assets to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.attachments to authenticated;

drop policy if exists "Allow authenticated read invoices" on public.invoices;
create policy "Allow authenticated read invoices"
  on public.invoices for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated write invoices" on public.invoices;
create policy "Allow authenticated write invoices"
  on public.invoices for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated read linked operations" on public.linked_operations;
create policy "Allow authenticated read linked operations"
  on public.linked_operations for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated write linked operations" on public.linked_operations;
create policy "Allow authenticated write linked operations"
  on public.linked_operations for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated read parties" on public.parties;
create policy "Allow authenticated read parties"
  on public.parties for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated write parties" on public.parties;
create policy "Allow authenticated write parties"
  on public.parties for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated read fiscal settings" on public.fiscal_settings;
create policy "Allow authenticated read fiscal settings"
  on public.fiscal_settings for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated write fiscal settings" on public.fiscal_settings;
create policy "Allow authenticated write fiscal settings"
  on public.fiscal_settings for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated read assets" on public.assets;
create policy "Allow authenticated read assets"
  on public.assets for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated write assets" on public.assets;
create policy "Allow authenticated write assets"
  on public.assets for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated read logs" on public.audit_logs;
create policy "Allow authenticated read logs"
  on public.audit_logs for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated read attachments" on public.attachments;
create policy "Allow authenticated read attachments"
  on public.attachments for select
  to authenticated
  using (true);
