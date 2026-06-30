# OrderFlow

A fully offline mobile app for small business owners to manage orders from Instagram, Facebook, WhatsApp, website, and email — with SQLite storage, smart paste parsing, product catalog, image management, analytics, kanban board, customer profiles, CSV export, and local backup/restore.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 54, expo-sqlite v15 (openDatabaseSync), expo-router v6
- Fonts: Inter (400/500/600/700) via @expo-google-fonts/inter
- Primary accent: #F8BCCD

## Where things live

- `artifacts/order-mgr/` — Expo mobile app (OrderFlow)
  - `app/(tabs)/` — 5 tab screens: Home, Orders, Catalog, Insights, Profile
  - `app/order/` — New order (modal) and order detail screens
  - `app/kanban.tsx` — Kanban board (3 columns: Confirmed/Shipped/Delivered)
  - `app/customers/` — Customer profiles list and detail
  - `context/DatabaseContext.tsx` — SQLite CRUD, AsyncStorage fallback for web
  - `components/` — OrderCard, StatusPill, PaymentPill, FilterChips, SmartPasteModal, ProductAutocomplete, KPICard
  - `utils/` — smartPaste.ts, imageUtils.ts, csvExport.ts
  - `types/index.ts` — Order, Product, CustomerProfile types
  - `constants/colors.ts` — Full pink/rose theme palette

## Architecture decisions

- Fully offline/local — no backend required for the mobile app; SQLite is primary storage
- expo-sqlite openDatabaseSync API (SDK 54 / sqlite v15) for synchronous operations wrapped in React context
- AsyncStorage fallback on web so the app preview works in browser
- Images compressed to 800px max via expo-image-manipulator, thumbnails at 150×150
- Smart paste uses regex extraction — no AI needed — works offline
- IDs generated with `Date.now().toString(36) + Math.random()` (no uuid dependency)

## Product

- **Dashboard** — Overdue alerts, due today count, outstanding balance, needs-attention list
- **Orders** — Full list with status filter chips (All/Confirmed/Shipped/Delivered) and search
- **New Order** — Source selector, smart paste from clipboard, product autocomplete, image picker, payment tracking
- **Order Detail** — Status timeline, advance status button, send to customer (WhatsApp/email/clipboard), tracking link
- **Kanban** — Horizontal scroll board with tap-to-advance per column
- **Catalog** — Product grid with image, category, default price; add/edit/delete
- **Insights** — Monthly revenue bar chart, source breakdown, top products, KPI cards
- **Customers** — Auto-aggregated profiles with repeat buyer detection, order history
- **Profile** — Outstanding balance summary, CSV export, JSON backup/restore, image cache clear

## User preferences

- Primary accent color: #F8BCCD (pink-rose)

## Gotchas

- `expo-sqlite` v15 uses synchronous API (`openDatabaseSync`, `db.runSync`, `db.getAllSync`)
- The web preview uses AsyncStorage fallback (no SQLite in browser)
- expo-clipboard, expo-document-picker, expo-image-manipulator, expo-sharing were installed at SDK 56 versions but work with SDK 54

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
