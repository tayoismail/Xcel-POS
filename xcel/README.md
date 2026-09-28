# Xcel POS

Modern POS & inventory management system for multi-branch retail.

## Stack

- **Framework:** Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- **UI:** shadcn/ui (Radix) + Lucide icons + next-themes (dark mode)
- **Forms:** react-hook-form + zod
- **Database:** PostgreSQL via Prisma · **Auth/data:** Supabase
- **Charts:** recharts · **Dates:** date-fns

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL + Supabase keys
npx prisma generate
npm run dev
```

## Structure

```
app/
  (auth)/login          # Sign-in page
  (dashboard)/dashboard # Main app shell (sidebar layout)
components/
  ui/                   # shadcn/ui primitives
  shared/               # Theme provider/toggle, shared widgets
  auth/                 # Login form
  dashboard/            # Sidebar, header
  pos/                  # (POS-specific components, later batch)
lib/
  supabase/             # Browser + server Supabase clients
  prisma.ts             # Prisma singleton
prisma/schema.prisma    # Database schema
types/                  # Shared TS types
```
