# CLAUDE.md - Rules & Project Context for "아이ติมเมฆน้อย" (Itim Mek Noi)

## Project Overview
This is an Ice Cream Ordering Web Application for "ไอติมเมฆน้อย" built with **Next.js (App Router, Pure JavaScript)**, **Supabase**, deployed on **Vercel**, with **Telegram Bot** notifications.

---

## ⚡ Mandatory Development Rules

### 1. Dynamic Route Parameters Handling (Next.js Latest Standard)
- `params` in Dynamic Routes is a **Promise**.
- **Client Components (`'use client'`):** MUST unwrap `params` using `React.use()`:
  ```javascript
  'use client';
  import { use } from 'react';

  export default function Page({ params }) {
    const { id } = use(params);
    // ...
  }
  ```
- **Server Components:** MUST unwrap `params` using `await`:
  ```javascript
  export default async function Page({ params }) {
    const { id } = await params;
    // ...
  }
  ```

### 2. Pricing Logic & Data Fetching
- Prices MUST come directly from the `menu_items` table in Supabase.
- **NEVER hardcode menu prices** on the client-side UI or in client scripts.

### 3. Telegram Integration & Security
- Telegram Bot interactions MUST be handled strictly via **Server-side API Routes** (e.g., `app/api/notify/route.js`).
- Never expose `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` to the browser.
- Only environment variables without the `NEXT_PUBLIC_` prefix should be used for secret keys on the server.

---

## 🗄️ Supabase Schema Reference

```sql
-- sessions: Tracks table sessions
sessions (
  id uuid primary key,
  table_number text,
  status text check (status in ('open', 'closed')),
  created_at timestamp with time zone
)

-- menu_categories: Ice cream categories
menu_categories (
  id uuid primary key,
  name text,
  sort_order int
)

-- menu_items: Ice cream items & pricing
menu_items (
  id uuid primary key,
  category_id uuid references menu_categories(id),
  name text,
  price numeric,
  is_available boolean
)

-- orders: Ice cream orders placed by customers
orders (
  id uuid primary key,
  session_id uuid references sessions(id),
  table_number text,
  items jsonb, -- Array of objects: [{ name: "กะทิสด", quantity: 2, price: 35 }]
  status text check (status in ('received', 'preparing', 'served')),
  notified boolean default false,
  created_at timestamp with time zone
)
```