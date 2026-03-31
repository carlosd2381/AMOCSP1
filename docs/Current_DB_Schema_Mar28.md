-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  brand_id uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id),
  CONSTRAINT audit_logs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  theme_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT brands_pkey PRIMARY KEY (id)
);
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  type text NOT NULL CHECK (type = ANY (ARRAY['couple'::text, 'corporate'::text])),
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  body_html text NOT NULL,
  signed_at timestamp with time zone,
  signature_img text,
  pdf_url text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT contracts_pkey PRIMARY KEY (id),
  CONSTRAINT contracts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT contracts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  title text NOT NULL,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  shoot_type text NOT NULL CHECK (shoot_type = ANY (ARRAY['photo'::text, 'video'::text, 'drone'::text, 'hybrid'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT events_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.galleries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  title text NOT NULL,
  password text,
  cover_img text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
  sharing_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT galleries_pkey PRIMARY KEY (id),
  CONSTRAINT galleries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT galleries_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  proposal_id uuid,
  brand_id uuid NOT NULL,
  invoice_number text NOT NULL,
  stripe_pi_id text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  taxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid'::text CHECK (status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text, 'partially_paid'::text])),
  due_date date,
  issued_at date,
  currency text NOT NULL DEFAULT 'MXN'::text,
  payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id),
  CONSTRAINT invoices_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id),
  CONSTRAINT invoices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'new'::text CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'proposal'::text, 'contract'::text, 'booked'::text, 'lost'::text])),
  event_date date,
  inquiry_notes text,
  source text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leads_pkey PRIMARY KEY (id),
  CONSTRAINT leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT leads_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.media_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  url text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['image'::text, 'video'::text])),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT media_items_pkey PRIMARY KEY (id),
  CONSTRAINT media_items_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id),
  CONSTRAINT media_items_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  provider text NOT NULL,
  provider_reference text,
  amount numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  is_withheld boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT payments_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin'::text,
  avatar_url text,
  brand_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  taxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text])),
  valid_until date,
  currency text NOT NULL DEFAULT 'MXN'::text,
  payment_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT proposals_pkey PRIMARY KEY (id),
  CONSTRAINT proposals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT proposals_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.webhooks_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  status_code integer,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT webhooks_log_pkey PRIMARY KEY (id)
);