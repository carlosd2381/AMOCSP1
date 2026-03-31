# AMO + CSP Studio OS

Unified multi-tenant workspace for Amo Studio MX (AMO) and Creative Soul Productions MX (CSP). The app ships a Vite + React 19 frontend with Tailwind-driven runtime theming, Supabase client wiring, Stripe hooks, tax-aware quote builder, Kanban CRM, contract editor, and dual-portals for admin plus clients.

## Core capabilities
- Dual brand (AMO/CSP) context with CSS variable theming, Tailwind tokens, and logo assets.
- Auth shell with `AuthContext`, React Query bootstrap, and Brand Switcher for instant tenant toggling.
- CRM flows: drag-and-drop Kanban (`@hello-pangea/dnd`) and React Hook Form quick capture validated by Zod.
- Sales + finance: tax-configurable quote builder, JSONB-friendly tax models, and payment schedule scaffolding.
- Legal + delivery: Tiptap contract editor, signature capture preview, gallery overview, and client portal routes.
- Infrastructure hooks: Supabase client, Stripe loader, storage helpers, and modular service layer stubs ready for webhook/API wiring.

## Tech stack
- React 19 + TypeScript, Vite 7, React Router v7, TanStack Query
- Tailwind CSS with runtime CSS variables, lucide-react, Radix primitives, react-hot-toast
- Forms and validation via React Hook Form, @hookform/resolvers, and Zod
- Data + integrations: Supabase JS, Stripe JS, @hello-pangea/dnd, @tiptap/react, @react-pdf/renderer, react-signature-canvas

## Getting started
1. Install dependencies
   ```bash
   npm install
   ```
2. Configure environment variables (see below).
3. Run the dev server with HMR + React Fast Refresh
   ```bash
   npm run dev -- --host
   ```

## Environment variables
Create a `.env` file in the project root. Vite exposes keys prefixed with `VITE_` to the browser bundle.

| Key | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key used by the browser client |
| `VITE_STRIPE_PUBLIC_KEY` | Publishable Stripe key for PaymentIntents |
| `VITE_GOOGLE_MAPS_KEY` | Google Maps JavaScript API key for CRM autofill |

Backend-only values (Supabase service role, Stripe secret, SendGrid/Resend keys, Wise/Remitly credentials) should live inside the Node automation environment described in the technical specification.

## Supabase setup
1. Install the Supabase CLI (macOS example):
   ```bash
   brew install supabase/tap/supabase
   ```
2. Authenticate and link this repo to your existing project:
   ```bash
   supabase login              # paste your personal access token
   supabase link --project-ref <your-project-ref>
   ```
3. Copy `.env.example` → `.env` and populate:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the Supabase dashboard (Project Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_JWT_SECRET` for server-side automations and RLS testing
4. Apply the baseline schema + triggers defined in [`supabase/schema.sql`](supabase/schema.sql):
   ```bash
   supabase db push
   # or db reset if you want a full rebuild locally
   ```
5. (Optional) Seed data by creating SQL files inside `supabase/` and running `supabase db push` again, or by using the SQL editor in the dashboard.
6. Once tables exist, the frontend `supabaseClient` (see `src/lib/supabase.ts`) will begin returning real data—swap the mock services incrementally for Supabase queries.

## Scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Launch Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the repo |

## Project layout
```
src/
├─ assets/          # AMO & CSP brand assets
├─ components/      # Shared UI, cards, nav, brand switcher
├─ contexts/        # Branding + Auth providers
├─ layouts/         # Admin sidebar + client portal shells
├─ lib/             # Supabase, Stripe, env, theme data, Query Client
├─ modules/         # Feature slices (dashboard, leads, quotes, contracts, gallery, portal, auth)
├─ routes/          # React Router tree
├─ services/        # Tax + storage helpers, mock APIs
└─ types/           # Domain models (brand, CRM, finance)
```

## Reference
- Detailed entity + UI mapping: [docs/data-dictionary.md](docs/data-dictionary.md)

## Next steps
- Replace mock data/services with Supabase queries, RLS policies, and Node webhooks for Stripe + SendGrid/Resend.
- Connect Google Maps Places API for address capture and Supabase Storage for galleries/signatures.
- Implement PDF templates (React PDF) plus Wise/Remitly export automations per brand tax requirements.
