-- AMO + CSP Unified Schema
-- Run with `supabase db push` or via SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  theme_config jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.brands (name, slug)
values
  ('Amo Studio MX', 'amo'),
  ('Creative Soul Productions MX', 'csp')
on conflict (slug) do update
set
  name = excluded.name,
  updated_at = now();

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'admin',
  avatar_url text,
  brand_id uuid references public.brands (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (email);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  name text not null,
  email text not null,
  phone text,
  type text not null check (type in ('couple', 'corporate')),
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_brand_id_idx on public.clients (brand_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  status text not null default 'new' check (status in ('new','contacted','proposal','contract','booked','lost')),
  event_date date,
  inquiry_notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_brand_status_idx on public.leads (brand_id, status);

create table if not exists public.address_book_contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  display_name text not null,
  email text,
  phone text,
  company text,
  job_title text,
  notes text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists address_book_contacts_brand_name_idx on public.address_book_contacts (brand_id, display_name);
create index if not exists address_book_contacts_brand_email_idx on public.address_book_contacts (brand_id, email);

create table if not exists public.venue_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  name text not null,
  resort_group text,
  address_line1 text,
  address_line2 text,
  city text,
  state_province text,
  postal_code text,
  country text,
  phone text,
  email text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_profiles_brand_name_idx on public.venue_profiles (brand_id, name);

create table if not exists public.lead_venue_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  venue_profile_id uuid not null references public.venue_profiles (id) on delete restrict,
  location_kind text not null default 'reception' check (location_kind in ('ceremony','reception','bridal_session','other')),
  location_label text,
  sort_order int not null default 0,
  status text not null default 'shortlisted' check (status in ('shortlisted','reserved','contracted','coordinator_pending','coordinator_assigned')),
  reserved_on date,
  coordinator_eta_weeks int,
  coordinator_assigned_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.lead_venue_assignments drop constraint if exists lead_venue_assignments_lead_id_key;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_venue_assignments'
      and column_name = 'location_kind'
  ) then
    alter table public.lead_venue_assignments
      add column location_kind text not null default 'reception';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_venue_assignments'
      and column_name = 'location_label'
  ) then
    alter table public.lead_venue_assignments
      add column location_label text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_venue_assignments'
      and column_name = 'sort_order'
  ) then
    alter table public.lead_venue_assignments
      add column sort_order int not null default 0;
  end if;

  alter table public.lead_venue_assignments
    drop constraint if exists lead_venue_assignments_location_kind_check;

  alter table public.lead_venue_assignments
    add constraint lead_venue_assignments_location_kind_check
    check (location_kind in ('ceremony','reception','bridal_session','other'));
end
$$;

create index if not exists lead_venue_assignments_lead_idx on public.lead_venue_assignments (lead_id);
create index if not exists lead_venue_assignments_venue_idx on public.lead_venue_assignments (venue_profile_id);
create index if not exists lead_venue_assignments_lead_location_idx on public.lead_venue_assignments (lead_id, location_kind, sort_order, created_at);

create table if not exists public.venue_team_contacts (
  id uuid primary key default gen_random_uuid(),
  venue_profile_id uuid not null references public.venue_profiles (id) on delete cascade,
  contact_id uuid not null references public.address_book_contacts (id) on delete cascade,
  role text not null check (role in ('planner', 'coordinator')),
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_profile_id, contact_id, role)
);

create index if not exists venue_team_contacts_venue_role_idx on public.venue_team_contacts (venue_profile_id, role, sort_order, created_at);
create index if not exists venue_team_contacts_contact_idx on public.venue_team_contacts (contact_id);

create table if not exists public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  event_id uuid,
  brand_id uuid not null references public.brands (id),
  contact_id uuid not null references public.address_book_contacts (id) on delete cascade,
  role text not null check (role in ('bride','groom','parent','venue_coordinator','wedding_planner','vendor','other','primary_client','planner')),
  source text not null default 'manual' check (source in ('manual','import','portal')),
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_contacts_lead_sort_idx on public.lead_contacts (lead_id, sort_order, created_at);
create index if not exists lead_contacts_brand_role_idx on public.lead_contacts (brand_id, role);

create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  title text not null,
  details text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_tasks_lead_status_idx on public.lead_tasks (lead_id, status, sort_order, due_at);

create table if not exists public.lead_internal_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_internal_notes_lead_created_idx on public.lead_internal_notes (lead_id, created_at desc);

create table if not exists public.lead_payables (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  title text not null,
  category text,
  amount numeric not null default 0,
  currency text not null default 'MXN',
  due_date date,
  status text not null default 'planned' check (status in ('planned', 'scheduled', 'paid', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_payables_lead_due_idx on public.lead_payables (lead_id, due_date, status);

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  channel text not null check (channel in ('email', 'whatsapp', 'instagram', 'phone', 'internal')),
  direction text not null check (direction in ('inbound', 'outbound')),
  subject text,
  body text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_messages_lead_occurred_idx on public.lead_messages (lead_id, occurred_at desc);

create table if not exists public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  category text not null check (category in ('contracts', 'timelines', 'shot_lists')),
  title text not null,
  file_url text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_files_lead_category_idx on public.lead_files (lead_id, category, created_at desc);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  location jsonb not null default '{}'::jsonb,
  shoot_type text not null check (shoot_type in ('photo','video','drone','hybrid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_contacts_event_id_fkey'
  ) then
    alter table public.lead_contacts
      add constraint lead_contacts_event_id_fkey
      foreign key (event_id)
      references public.events (id)
      on delete set null;
  end if;
end
$$;

create index if not exists events_brand_start_idx on public.events (brand_id, start_time);

create table if not exists public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  client_email text not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id)
);

create index if not exists questionnaires_brand_status_idx on public.questionnaires (brand_id, status);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  taxes jsonb not null default '[]'::jsonb,
  total_amount numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  valid_until date,
  currency text not null default 'MXN',
  payment_schedule jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_brand_status_idx on public.proposals (brand_id, status);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  body_html text not null,
  signed_at timestamptz,
  signature_img text,
  pdf_url text,
  variables jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_brand_signed_idx on public.contracts (brand_id, signed_at);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  proposal_id uuid references public.proposals (id) on delete set null,
  brand_id uuid not null references public.brands (id),
  invoice_number text not null,
  stripe_pi_id text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  taxes jsonb not null default '[]'::jsonb,
  total_amount numeric not null default 0,
  amount_due numeric not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','paid','overdue','cancelled','partially_paid')),
  due_date date,
  issued_at date,
  currency text not null default 'MXN',
  payments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_invoice_number_key on public.invoices (invoice_number);
create index if not exists invoices_brand_status_idx on public.invoices (brand_id, status);

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  title text not null,
  password text,
  cover_img text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  sharing_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists galleries_brand_status_idx on public.galleries (brand_id, status);

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  url text not null,
  type text not null check (type in ('image','video')),
  metadata jsonb not null default '{}'::jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_items_gallery_idx on public.media_items (gallery_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  brand_id uuid not null references public.brands (id),
  provider text not null,
  provider_reference text,
  amount numeric not null,
  fee numeric not null default 0,
  currency text not null default 'MXN',
  status text not null default 'pending',
  is_withheld boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhooks_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  status_code int,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  brand_id uuid references public.brands (id),
  action text not null,
  table_name text not null,
  record_id uuid,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- helper function to update updated_at
create or replace function public.trigger_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- attach triggers
drop trigger if exists set_updated_at_brands on public.brands;
create trigger set_updated_at_brands
before update on public.brands
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_clients on public.clients;
create trigger set_updated_at_clients
before update on public.clients
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_leads on public.leads;
create trigger set_updated_at_leads
before update on public.leads
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_address_book_contacts on public.address_book_contacts;
create trigger set_updated_at_address_book_contacts
before update on public.address_book_contacts
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_venue_profiles on public.venue_profiles;
create trigger set_updated_at_venue_profiles
before update on public.venue_profiles
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_venue_assignments on public.lead_venue_assignments;
create trigger set_updated_at_lead_venue_assignments
before update on public.lead_venue_assignments
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_venue_team_contacts on public.venue_team_contacts;
create trigger set_updated_at_venue_team_contacts
before update on public.venue_team_contacts
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_contacts on public.lead_contacts;
create trigger set_updated_at_lead_contacts
before update on public.lead_contacts
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_tasks on public.lead_tasks;
create trigger set_updated_at_lead_tasks
before update on public.lead_tasks
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_internal_notes on public.lead_internal_notes;
create trigger set_updated_at_lead_internal_notes
before update on public.lead_internal_notes
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_payables on public.lead_payables;
create trigger set_updated_at_lead_payables
before update on public.lead_payables
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_messages on public.lead_messages;
create trigger set_updated_at_lead_messages
before update on public.lead_messages
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_lead_files on public.lead_files;
create trigger set_updated_at_lead_files
before update on public.lead_files
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_events on public.events;
create trigger set_updated_at_events
before update on public.events
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_questionnaires on public.questionnaires;
create trigger set_updated_at_questionnaires
before update on public.questionnaires
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_proposals on public.proposals;
create trigger set_updated_at_proposals
before update on public.proposals
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_contracts on public.contracts;
create trigger set_updated_at_contracts
before update on public.contracts
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_invoices on public.invoices;
create trigger set_updated_at_invoices
before update on public.invoices
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_galleries on public.galleries;
create trigger set_updated_at_galleries
before update on public.galleries
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_media_items on public.media_items;
create trigger set_updated_at_media_items
before update on public.media_items
for each row execute function public.trigger_set_updated_at();

drop trigger if exists set_updated_at_payments on public.payments;
create trigger set_updated_at_payments
before update on public.payments
for each row execute function public.trigger_set_updated_at();
