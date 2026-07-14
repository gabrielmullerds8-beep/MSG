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
  discount_value numeric(14, 2) not null default 0,
  retention_type text,
  retention_value numeric(14, 2) not null default 0,
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
  financial_installments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists pf_value numeric(14, 2) not null default 0;

alter table public.invoices
  add column if not exists carrier_name text;

alter table public.invoices
  add column if not exists financial_installments jsonb not null default '[]'::jsonb;

alter table public.invoices
  add column if not exists retention_type text;

alter table public.invoices
  add column if not exists retention_value numeric(14, 2) not null default 0;

alter table public.invoices
  add column if not exists discount_value numeric(14, 2) not null default 0;

update public.invoices
set financial_installments = (
  select coalesce(
    jsonb_agg(
      case
        when installment ? 'holder' then installment
        else installment || jsonb_build_object('holder', 'Itaú')
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(public.invoices.financial_installments, '[]'::jsonb)) as installment
)
where financial_installments is not null;

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
  situation text not null default 'Próprio' check (situation in ('Próprio', 'Alugado', 'Vendido')),
  status text check (status is null or status in ('Em uso', 'Locado', 'Empréstimo')),
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets
  add column if not exists situation text not null default 'Próprio',
  add column if not exists status text,
  add column if not exists notes text;

update public.assets
set situation = 'Vendido', status = null
where archived = true and situation <> 'Vendido';

update public.assets
set status = 'Em uso'
where archived = false and situation <> 'Vendido' and status is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assets_situation_check') then
    alter table public.assets add constraint assets_situation_check
      check (situation in ('Próprio', 'Alugado', 'Vendido'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assets_status_check') then
    alter table public.assets add constraint assets_status_check
      check (status is null or status in ('Em uso', 'Locado', 'Empréstimo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assets_sold_status_check') then
    alter table public.assets add constraint assets_sold_status_check
      check (situation <> 'Vendido' or status is null);
  end if;
end $$;

create table if not exists public.cash_movements (
  id text primary key,
  movement_type text not null check (movement_type in ('entry', 'outflow', 'transfer')),
  cash_scope text not null default 'normal' check (cash_scope in ('normal', 'pf')),
  movement_date date not null,
  holder text not null,
  destination_holder text,
  cost_center text,
  destination_cost_center text,
  history text,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cash_movements
  add column if not exists cash_scope text not null default 'normal';

create table if not exists public.products (
  id text primary key,
  product_code text,
  name text not null,
  ncm text,
  default_cost_center text,
  default_category text,
  default_unit text,
  accounting_account text,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists product_code text;

create table if not exists public.checks (
  id text primary key,
  check_number text not null,
  amount numeric(14, 2) not null default 0,
  issuer_name text not null,
  issuer_document text,
  bank text,
  agency text,
  account text,
  due_date date not null,
  received_date date not null,
  received_from text,
  passed_date date,
  passed_to text,
  deposit_date date,
  deposit_holder text,
  deposit_agency text,
  deposit_account text,
  compensation_date date,
  compensation_holder text,
  returned_date date,
  returned_reason text,
  recovered_date date,
  recovered_from text,
  recovery_reason text,
  canceled_date date,
  canceled_reason text,
  related_invoices jsonb not null default '[]'::jsonb,
  notes text,
  status text not null default 'received' check (status in ('received', 'holding', 'passed', 'deposited', 'compensated', 'returned', 'canceled')),
  movements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checks add column if not exists deposit_date date;
alter table public.checks add column if not exists deposit_holder text;
alter table public.checks add column if not exists deposit_agency text;
alter table public.checks add column if not exists deposit_account text;
alter table public.checks add column if not exists compensation_date date;
alter table public.checks add column if not exists compensation_holder text;
alter table public.checks add column if not exists returned_date date;
alter table public.checks add column if not exists returned_reason text;
alter table public.checks add column if not exists recovered_date date;
alter table public.checks add column if not exists recovered_from text;
alter table public.checks add column if not exists recovery_reason text;
alter table public.checks add column if not exists canceled_date date;
alter table public.checks add column if not exists canceled_reason text;
alter table public.checks drop constraint if exists checks_status_check;
alter table public.checks add constraint checks_status_check check (status in ('received', 'holding', 'passed', 'deposited', 'compensated', 'returned', 'canceled'));

drop table if exists public.allowed_users cascade;


create index if not exists invoices_type_date_idx on public.invoices(invoice_type, issue_date);
create index if not exists invoices_cfop_idx on public.invoices(main_cfop);
create index if not exists invoices_party_idx on public.invoices(party_name);
create index if not exists attachments_invoice_id_idx on public.attachments(invoice_id);
create index if not exists linked_operations_status_idx on public.linked_operations(status);
create index if not exists parties_kind_name_idx on public.parties(kind, name);
create index if not exists assets_archived_type_idx on public.assets(archived, item_type);
create index if not exists cash_movements_date_holder_idx on public.cash_movements(movement_date, holder);
create index if not exists products_name_idx on public.products(name);
create index if not exists checks_status_due_idx on public.checks(status, due_date);

alter table public.invoices replica identity full;
alter table public.linked_operations replica identity full;
alter table public.parties replica identity full;
alter table public.fiscal_settings replica identity full;
alter table public.assets replica identity full;
alter table public.cash_movements replica identity full;
alter table public.products replica identity full;
alter table public.checks replica identity full;

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
      and tablename = 'cash_movements'
  ) then
    alter publication supabase_realtime add table public.cash_movements;
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'checks'
  ) then
    alter publication supabase_realtime add table public.checks;
  end if;
end $$;

alter table public.invoices enable row level security;
alter table public.linked_operations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.attachments enable row level security;
alter table public.parties enable row level security;
alter table public.fiscal_settings enable row level security;
alter table public.assets enable row level security;
alter table public.cash_movements enable row level security;
alter table public.products enable row level security;
alter table public.checks enable row level security;

revoke all on table public.invoices from anon;
revoke all on table public.linked_operations from anon;
revoke all on table public.parties from anon;
revoke all on table public.fiscal_settings from anon;
revoke all on table public.assets from anon;
revoke all on table public.cash_movements from anon;
revoke all on table public.products from anon;
revoke all on table public.checks from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.attachments from anon;
revoke all on table public.invoices from authenticated;
revoke all on table public.linked_operations from authenticated;
revoke all on table public.parties from authenticated;
revoke all on table public.fiscal_settings from authenticated;
revoke all on table public.assets from authenticated;
revoke all on table public.cash_movements from authenticated;
revoke all on table public.products from authenticated;
revoke all on table public.checks from authenticated;
revoke all on table public.audit_logs from authenticated;
revoke all on table public.attachments from authenticated;

grant select, insert, update, delete on table public.invoices to authenticated;
grant select, insert, update, delete on table public.linked_operations to authenticated;
grant select, insert, update, delete on table public.parties to authenticated;
grant select, insert, update, delete on table public.fiscal_settings to authenticated;
grant select, insert, update, delete on table public.assets to authenticated;
grant select, insert, update, delete on table public.cash_movements to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.checks to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.attachments to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(pg_proc.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end $$;

drop policy if exists "Allow authenticated read invoices" on public.invoices;
create policy "Allow authenticated read invoices"
  on public.invoices for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated write invoices" on public.invoices;
drop policy if exists "Allow authenticated insert invoices" on public.invoices;
create policy "Allow authenticated insert invoices"
  on public.invoices for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update invoices" on public.invoices;
create policy "Allow authenticated update invoices"
  on public.invoices for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete invoices" on public.invoices;
create policy "Allow authenticated delete invoices"
  on public.invoices for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read linked operations" on public.linked_operations;
create policy "Allow authenticated read linked operations"
  on public.linked_operations for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated write linked operations" on public.linked_operations;
drop policy if exists "Allow authenticated insert linked operations" on public.linked_operations;
create policy "Allow authenticated insert linked operations"
  on public.linked_operations for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update linked operations" on public.linked_operations;
create policy "Allow authenticated update linked operations"
  on public.linked_operations for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete linked operations" on public.linked_operations;
create policy "Allow authenticated delete linked operations"
  on public.linked_operations for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read parties" on public.parties;
create policy "Allow authenticated read parties"
  on public.parties for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated write parties" on public.parties;
drop policy if exists "Allow authenticated insert parties" on public.parties;
create policy "Allow authenticated insert parties"
  on public.parties for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update parties" on public.parties;
create policy "Allow authenticated update parties"
  on public.parties for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete parties" on public.parties;
create policy "Allow authenticated delete parties"
  on public.parties for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read fiscal settings" on public.fiscal_settings;
create policy "Allow authenticated read fiscal settings"
  on public.fiscal_settings for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated write fiscal settings" on public.fiscal_settings;
drop policy if exists "Allow authenticated insert fiscal settings" on public.fiscal_settings;
create policy "Allow authenticated insert fiscal settings"
  on public.fiscal_settings for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update fiscal settings" on public.fiscal_settings;
create policy "Allow authenticated update fiscal settings"
  on public.fiscal_settings for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete fiscal settings" on public.fiscal_settings;
create policy "Allow authenticated delete fiscal settings"
  on public.fiscal_settings for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read assets" on public.assets;
create policy "Allow authenticated read assets"
  on public.assets for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated write assets" on public.assets;
drop policy if exists "Allow authenticated insert assets" on public.assets;
create policy "Allow authenticated insert assets"
  on public.assets for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update assets" on public.assets;
create policy "Allow authenticated update assets"
  on public.assets for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete assets" on public.assets;
create policy "Allow authenticated delete assets"
  on public.assets for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read cash movements" on public.cash_movements;
create policy "Allow authenticated read cash movements"
  on public.cash_movements for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated insert cash movements" on public.cash_movements;
create policy "Allow authenticated insert cash movements"
  on public.cash_movements for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update cash movements" on public.cash_movements;
create policy "Allow authenticated update cash movements"
  on public.cash_movements for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete cash movements" on public.cash_movements;
create policy "Allow authenticated delete cash movements"
  on public.cash_movements for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read products" on public.products;
create policy "Allow authenticated read products"
  on public.products for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated insert products" on public.products;
create policy "Allow authenticated insert products"
  on public.products for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update products" on public.products;
create policy "Allow authenticated update products"
  on public.products for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete products" on public.products;
create policy "Allow authenticated delete products"
  on public.products for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read checks" on public.checks;
create policy "Allow authenticated read checks"
  on public.checks for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated insert checks" on public.checks;
create policy "Allow authenticated insert checks"
  on public.checks for insert
  to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated update checks" on public.checks;
create policy "Allow authenticated update checks"
  on public.checks for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated delete checks" on public.checks;
create policy "Allow authenticated delete checks"
  on public.checks for delete
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read logs" on public.audit_logs;
create policy "Allow authenticated read logs"
  on public.audit_logs for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Allow authenticated read attachments" on public.attachments;
create policy "Allow authenticated read attachments"
  on public.attachments for select
  to authenticated
  using ((select auth.uid()) is not null);
