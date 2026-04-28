-- Catalog persistence tables for service composer data
-- Safe to run multiple times.

create table if not exists public.brand_catalog_services (
  id text primary key,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  name_es text,
  description text not null default '',
  description_es text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_catalog_services_brand_idx
  on public.brand_catalog_services (brand_id, name);

create table if not exists public.brand_service_pricing_tiers (
  id text primary key,
  brand_id uuid not null references public.brands (id) on delete cascade,
  service_id text not null references public.brand_catalog_services (id) on delete cascade,
  catalog_key text not null default 'INT_USD_ENG' check (catalog_key in ('INT_USD_ENG', 'MEX_MXN_ESP')),
  hours int not null check (hours >= 1 and hours <= 24),
  cost numeric not null default 0,
  price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, service_id, catalog_key, hours)
);

create index if not exists brand_service_pricing_tiers_brand_catalog_idx
  on public.brand_service_pricing_tiers (brand_id, catalog_key, service_id, hours);

create table if not exists public.brand_package_presets (
  id text primary key,
  brand_id uuid not null references public.brands (id) on delete cascade,
  catalog_key text not null default 'INT_USD_ENG' check (catalog_key in ('INT_USD_ENG', 'MEX_MXN_ESP')),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  package_hourly_price numeric,
  hourly_price_by_hour jsonb,
  components jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_package_presets_brand_catalog_idx
  on public.brand_package_presets (brand_id, catalog_key, updated_at desc);

create table if not exists public.brand_pricing_input_profiles (
  id text primary key,
  brand_id uuid not null references public.brands (id) on delete cascade,
  catalog_key text not null default 'INT_USD_ENG' check (catalog_key in ('INT_USD_ENG', 'MEX_MXN_ESP')),
  admin_percent numeric not null default 5,
  sales_percent numeric not null default 10,
  planner_percent numeric not null default 15,
  profit_percent numeric not null default 35,
  payment_fee_percent numeric not null default 5.85,
  tax_percent numeric not null default 16,
  include_tax_in_sell_price boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (brand_id, catalog_key)
);

create index if not exists brand_pricing_input_profiles_brand_catalog_idx
  on public.brand_pricing_input_profiles (brand_id, catalog_key);
