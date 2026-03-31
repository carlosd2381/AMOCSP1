# AMO + CSP Unified Data Dictionary

_Comprehensive mapping of frontend surfaces to Supabase entities, fields, and calculated values._

## 1. Conventions & Shared Fields
- **brand_id (UUID)**: Present on every brand-scoped row; determines theming and authorization. Admins may query multiple `brand_id` values, while clients are restricted to their assigned brand.
- **created_at / updated_at (timestamptz)**: Auto-managed timestamps applied to every table for auditing and sorting.
- **JSONB fields** are camel-cased when hydrated into the React app (e.g., `line_items` → `lineItems`).
- **Slug aliases**: brand slugs are strictly `'amo'` or `'csp'` and drive runtime CSS variables via `BrandingContext`.
- **Currency**: Unless otherwise noted, MXN is the default and should be stored as ISO currency codes.

## 2. Core Entities

### 2.1 `brands`
| Column | Type | Description | Used In |
| --- | --- | --- | --- |
| `id` | uuid PK | Tenant identifier | All admin & client views via `BrandingContext`
| `name` | text | Full brand name | Side nav header, portal welcome
| `slug` | text unique | `amo` \| `csp` used for theming and RLS | BrandingContext, APIs
| `theme_config` | jsonb | `{ colors, fonts, logos }` overrides merged into CSS vars | global styling
| `settings` | jsonb | `{ taxes, invoicing_pattern, gateways, default_emails }` | Quote builder, invoices, automations

### 2.2 `profiles`
| Column | Type | Description | Used In |
| --- | --- | --- | --- |
| `id` | uuid PK | references `auth.users` | AuthContext
| `full_name` | text | Display name | TopBar user chip
| `email` | text | Login/email notifications | AuthContext login
| `role` | text | `'admin' | 'producer' | 'client'` | UI permissions, layout toggles
| `avatar_url` | text | Optional CDN asset | TopBar avatar (placeholder currently)
| `brand_id` | uuid nullable | Brand-scoped user; null => cross-brand admin | AuthContext + RLS

### 2.3 `clients`
| Column | Type | Description |
| --- | --- | --- |
| `id` (uuid) | Primary key referenced by leads/events/invoices |
| `brand_id` (uuid FK) | Determines theme + portal visibility |
| `name`, `email`, `phone` (text) | CRM contact data |
| `type` (text enum) | `'couple'` or `'corporate'`; toggles UI copy |
| `address` (jsonb) | `{ street, city, state, country, postal_code, tax_id }` |

### 2.4 `leads`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `client_id` | uuid FK clients.id |
| `brand_id` | uuid FK brands.id |
| `status` | text enum (`new`, `contacted`, `proposal`, `contract`, `booked`, `lost`) |
| `event_date` | date |
| `inquiry_notes` | text |
| `source` | text |

### 2.5 `events`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `lead_id` | uuid FK leads.id |
| `title` | text |
| `start_time` / `end_time` | timestamptz |
| `location` | jsonb `{ lat, lng, place_id, formatted_address }` |
| `shoot_type` | text enum (`photo`, `video`, `drone`, `hybrid`) |

### 2.6 `proposals`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `lead_id` | uuid FK leads.id |
| `brand_id` | uuid |
| `line_items` | jsonb array `{ id, desc, unit_price, qty, discounts?, tax_breakdown? }` |
| `subtotal` | numeric |
| `taxes` | jsonb array of tax lines (see §3) |
| `total_amount` | numeric |
| `status` | text enum (`draft`, `sent`, `accepted`, `rejected`) |
| `valid_until` | date |
| `currency` | text (ISO) |
| `payment_schedule` | jsonb array `{ installment_id, due_date, amount, status }` |

### 2.7 `contracts`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `event_id` | uuid |
| `body_html` | text (Tiptap JSON stored separately if desired) |
| `signed_at` | timestamptz nullable |
| `signature_img` | text (Supabase Storage URL) |
| `pdf_url` | text (generated React-PDF artifact) |
| `variables` | jsonb (key/value merge fields) |

### 2.8 `invoices`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `event_id` | uuid |
| `proposal_id` | uuid nullable |
| `invoice_number` | text (brand-specific pattern) |
| `stripe_pi_id` | text nullable |
| `line_items` | jsonb (mirrors proposals) |
| `subtotal` / `taxes` / `total_amount` | numeric/jsonb |
| `amount_due` | numeric |
| `status` | enum (`unpaid`, `paid`, `overdue`, `cancelled`, `partially_paid`) |
| `due_date` / `issued_at` | date |
| `currency` | text |
| `payments` | jsonb ledger `{ provider, reference, amount, fee, status, timestamp }` |

### 2.9 `galleries`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `event_id` | uuid |
| `title` | text |
| `password` | text nullable |
| `cover_img` | text |
| `status` | enum (`draft`, `published`, `archived`) |
| `sharing_settings` | jsonb `{ expiry_date, download_limit, allow_favorites }` |

### 2.10 `media_items`
| Column | Type | Description |
| --- | --- | --- |
| `id` | uuid |
| `gallery_id` | uuid |
| `url` | text |
| `type` | enum (`image`, `video`) |
| `metadata` | jsonb `{ width, height, duration, size }` |
| `is_favorite` | boolean |

### 2.11 Supporting Tables
- `payments`: normalized ledger for payouts/fees (connects to Stripe + Wise/Remitly).
- `webhooks_log`: raw payloads for Stripe, SendGrid, Supabase events.
- `audit_logs`: captures mutation summaries (`action`, `table`, `record_id`, `actor_id`, `metadata`).

## 3. Tax Object Reference
All `taxes` arrays (proposals, invoices) follow:
```
{
  "code": "IVA" | "IVA_RET" | "ISR" | "ISR_RET",
  "display_name": "IVA Retenido",
  "rate": 0.1600,            // decimal fraction
  "amount": 18500.00,         // numeric (can be negative if withheld)
  "base_amount": 115000.00,
  "is_withheld": true | false
}
```
- Default rates live under `brands.settings.taxes.default_rates` but may be overridden per document.
- UI toggles for withheld taxes map directly to `is_withheld` and influence `amount` sign.

## 4. Page / Module Data Mapping
The following sections connect UI surfaces to Supabase entities and derived fields.

### 4.1 Admin Dashboard (`/`)
| UI Tile / Section | Fields | Source |
| --- | --- | --- |
| Pipeline stats | Count of leads grouped by `status`, `brand_id` | `leads` join `clients` |
| Payments tile | Aggregate of `invoices.amount_due`, `status` filter, `brand_id` scope | `invoices` |
| Contracts tile | Count of `contracts` where `signed_at IS NULL` ordered by `events.start_time` | `contracts` + `events` |
| Production tile | Sum of scheduled `events` grouped by `shoot_type` | `events` |
| Upcoming productions list | `events` joined with `clients`, includes `location.formatted_address` | `events`, `clients` |
| Quick context callouts | Derived analytics (campaign performance, Wise readiness) computed via warehoused metrics or Supabase RPC | Analytics schema |

### 4.2 Leads & CRM (`/leads`)
| Feature | Fields | Source |
| --- | --- | --- |
| Kanban columns | `leads` grouped by `status`, each item displays `clients.name`, `clients.type`, `event_date`, `inquiry_notes` | `leads`, `clients` |
| Drag & drop reorder | Mutation updates `leads.status`, `updated_at`, optionally `lead_status_history` audit | `leads` + audit table |
| Quick Add form | Captures `clients` (temp) + `leads` minimal fields: `{ name, email, phone?, brand_id, event_date, source }` | `clients`, `leads` |
| Google Maps autofill (future) | Populates `leads.location_temp` + eventual `events.location` prior to conversion | Google Maps API → Supabase stored fields |

### 4.3 Quote Builder (`/quotes`)
| UI Element | Fields | Source |
| --- | --- | --- |
| Line items table | `proposals.line_items` referencing `description`, `quantity`, `unit_price`, `discounts` | `proposals` |
| Tax toggles | Derived defaults from `brands.settings.taxes.defaults` with overrides stored in `proposals.taxes` | `brands`, `proposals` |
| Subtotal / total | Calculated via `line_items` and `taxes` (see `summarizeQuote`) | Client-side calculation persisted to `proposals.subtotal` & `total_amount` |
| Payment schedule | `payment_schedule` JSONB array defining installments | `proposals` |

### 4.4 Contracts Editor (`/contracts`)
| Feature | Fields | Source |
| --- | --- | --- |
| Tiptap content | `contracts.body_html` (optionally `body_json`) | `contracts` |
| Merge variables | `contracts.variables` merged with `clients` + `events` (e.g., `{{client_name}}`, `{{brand}}`, `{{event_date}}`) | `contracts`, `clients`, `events` |
| Signature capture | Signature PNG stored in Supabase Storage; metadata saved to `contracts.signature_img` + `signed_at` timestamp | Supabase Storage, `contracts` |
| PDF pipeline | React-PDF renders contract; file path stored in `contracts.pdf_url` | Worker/service functions |

### 4.5 Galleries (`/galleries` + Client portal)
| Element | Fields | Source |
| --- | --- | --- |
| Gallery cards | `galleries.title`, `status`, `password`, `cover_img`, count of `media_items` | `galleries`, `media_items` |
| Open gallery CTA | Links to portal route parameterized by `galleries.id` and optionally `password` | Router + Supabase signed URL |
| Favorites/downloads | `media_items.is_favorite`, download limit from `galleries.sharing_settings.download_limit` | `media_items`, `galleries` |

### 4.6 Client Portal (`/portal`, `/portal/galleries`)
| Component | Fields | Source |
| --- | --- | --- |
| Hero text | `brands.name`, `brands.tagline`, `clients.name` (session) | `brands`, `clients` |
| Timeline entries | Aggregated tasks: next invoice (`invoices.status`, `amount_due`, `due_date`), questionnaires (`questionnaires.status`), gallery unlock dates (`galleries.status`, `events.start_time`) | `invoices`, `questionnaires`, `galleries`, `events` |
| Galleries section | Same data as admin but filtered by `client_id` and `status='published'` | `galleries`, `media_items` |

### 4.7 Auth & Branding Contexts
| Context | Fields | Source |
| --- | --- | --- |
| AuthContext | `profiles` + Supabase Auth session (email, role, brand scope) | Supabase Auth, `profiles` |
| BrandingContext | `brands.slug`, `theme_config.fonts`, `theme_config.colors`, `settings.tagline` | `brands` |

## 5. Calculated & Derived Fields
| Derived Field | Formula | Appears In |
| --- | --- | --- |
| Lead board column count | `COUNT(leads.id) WHERE status = ? AND brand_id IN scope` | Dashboard, Leads board headers |
| Quote subtotal | `Σ (quantity * unit_price - discounts)` | Quote builder summary |
| Tax amount | `base_amount * rate * (is_withheld ? -1 : 1)` | Quote builder, invoices | 
| Invoice amount due | `total_amount - Σ(payments.amount)` | Portal timeline, admin finance widgets |
| Contract status | `signed_at IS NULL ? 'Awaiting signature' : 'Signed'` | Dashboard stats |

## 6. Supabase Storage Buckets
| Bucket | Purpose | Example Paths |
| --- | --- | --- |
| `media` | Gallery assets (images/videos) | `media/{brand_slug}/{event_id}/{filename}` |
| `contracts` | Signed PDFs & signatures | `contracts/{contract_id}/signed.pdf` |
| `branding` | Logos, fonts (optional) | `branding/{brand_slug}/logo-dark.svg` |

## 7. API Integrations & References
| Integration | Stored Fields | Notes |
| --- | --- | --- |
| Stripe | `invoices.stripe_pi_id`, `payments.provider_reference`, `brands.settings.payment_gateways.stripe` | Webhooks update invoice/payment status |
| Wise / Remitly | `payments.settlement_id`, accounting exports | Values stored in supporting tables when payouts triggered |
| Google Maps | `events.location`, `clients.address` | API keys stored in env vars / `brands.settings.api.google_maps` |
| SendGrid / Resend | `brands.settings.email.default_from`, templates stored per brand | Used for quote/contract/invoice notifications |

## 8. Data Flow by User Journey
1. **Lead capture**: Quick add form writes `clients` + `leads`. Status changes recorded via Kanban drag & drop.
2. **Proposal creation**: Lead converts to event + proposal. UI builds `line_items`, toggles taxes, stores totals and payment schedule.
3. **Contract & invoice**: Accepted proposal spawns `contracts` & `invoices` referencing the same `event_id`. Signatures + PDFs stored in Supabase Storage; invoices track Stripe Payment Intents.
4. **Delivery**: Media uploaded to Supabase Storage; `galleries` + `media_items` records created. Client portal fetches only published galleries tied to their `client_id` and `brand_id`.

## 9. Pending Implementations
- **Supabase RPCs** for analytics tiles (pipeline velocity, campaign performance).
- **RLS policies** ensuring clients can only access records where `clients.id = auth.uid()` mapping.
- **Webhook logs** for Stripe/Supabase functions to reconcile financial operations.
- **Questionnaires table** (not yet scaffolded) to satisfy portal timeline placeholder.

---
**Usage**: Reference this document when wiring Supabase tables, writing migrations, or mapping UI state to backend payloads. Update as new modules (e.g., questionnaires, exports) are introduced.
