# Allo Inventory Reservation System

This is a Next.js take-home assignment for building a concurrency-safe inventory reservation system for multi-warehouse checkout flows.

## Live Demo

Add deployed Vercel URL here.

## GitHub Repository

Add GitHub repository URL here.

## Tech Stack

- Next.js App Router
- TypeScript
- Prisma ORM
- Hosted PostgreSQL
- Tailwind CSS
- Zod

## Features

- Product listing
- Warehouse listing
- Stock tracking per product per warehouse
- Temporary reservation during checkout
- Live countdown timer
- Confirm purchase flow
- Cancel reservation flow
- Expired reservation release endpoint
- User-visible 409 and 410 errors
- Concurrency-safe reservation logic

## Data Model

The system has:

- Products
- Warehouses
- Stock per product per warehouse
- Reservations

Each stock row stores:

- totalUnits
- reservedUnits

Available stock is calculated as:

availableUnits = totalUnits - reservedUnits

Each reservation has:

- productId
- warehouseId
- quantity
- status
- expiresAt

Reservation statuses:

- PENDING
- CONFIRMED
- RELEASED

## Concurrency Strategy

The most important part of this assignment is preventing inventory overselling under high concurrency. 

To solve this, we implemented **pessimistic row locking** at the database layer using PostgreSQL `SELECT ... FOR UPDATE` transactions:
1. **Reservation holds (`POST /api/reservations`):** When a user requests to hold stock, we immediately lock the corresponding `Stock` row. This blocks concurrent requests for the exact same Product + Warehouse combination. We evaluate the available stock *inside the lock*, decrement it, and create the reservation. Because other requests wait in line, they evaluate the most up-to-date numbers.
2. **State transitions (`confirm` & `release`):** When confirming or releasing a reservation, we acquire a pessimistic row lock on the `Reservation` row. This prevents race conditions between the customer (e.g., clicking confirm) and background/cron processes (e.g., attempting to expire/release). Only one transaction can change the status from `PENDING`, completely avoiding double-decrementing stock.
3. **Transaction Queueing:** To handle high-concurrency waiting lines without failure, we configure interactive transaction timeouts to 30 seconds (`timeout: 30000`), letting waiting transactions serialize and process smoothly.

---

## Expiry Mechanism & Lazy Cleanup

Reservations expire after **10 minutes**. We use a dual-layer cleanup mechanism:

1. **Lazy Cleanup on Read (Real-Time):** Before querying products or reservations, we trigger a global `lazyCleanup()` utility. It scans for any expired pending reservations, locks their Stock/Reservation rows, and releases the inventory in a single transaction. This guarantees that **stock levels are immediately corrected in real-time** whenever a user visits the catalog or attempts to check out, with zero delay.
2. **Scheduled Cleanup (Vercel Cron):** We maintain a cron endpoint `/api/cron/release-expired` which runs every 5 minutes in production (configured in `vercel.json`) to clean up abandoned carts in the background.

---

## Persistent DB-Based Idempotency (Bonus)

We implemented robust idempotency for both the **Reserve** and **Confirm** endpoints using an `IdempotencyKey` table in PostgreSQL:
- Clients submit an `Idempotency-Key` header (generated on the client via `crypto.randomUUID()`).
- The API checks if the key exists. If it does, it immediately returns the cached HTTP response code and JSON payload, completely skipping the side effects.
- If it's a new key, the API runs the transaction, records the status and JSON response in the database under that key, and returns.
- This provides transactionally consistent idempotency using our main database as the single source of truth, avoiding the need for an external Redis instance.

---

## Premium UI & UX

We built a high-fidelity glassmorphic dark-mode dashboard tailored for multi-warehouse retail:
- **Interactive Stats:** Real-time counters showing SKU catalogs, active warehouses, total units, and active reserved holds.
- **Custom Quantity Selector:** Customers can choose exact quantities to reserve, backed by live available stock constraints.
- **Micro-Animations:** Hover glows on cards, pulse indicators for active reservations, and animated loading spinners for pending transactions.
- **Sleek Reactive Timer:** The countdown timer dynamically changes color based on time left (**Emerald** when > 5m, **Amber** when <= 5m, **Vibrant Pulsing Red** when <= 1m) and renders an animated progress bar.
- **Auto-Release Transition:** When the timer hits `0:00`, the UI immediately transforms into an "Expired" state and fires a release request in the background, without requiring a page refresh.
- **Clear Error Modals:** Displays elegant "Transaction Blocked" banners showing 409 (Out of Stock) and 410 (Expired) responses directly to the user.

---

## Local Setup & Verification

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="your-hosted-postgres-url-with-sslmode=require"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Sync Database Schema & Generate Prisma Client
```bash
npx prisma db push
npx prisma generate
```

### 4. Seed Database
```bash
npx prisma db seed
```

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Run Integration Test Suite
To verify the concurrency and idempotency features:
```bash
npx tsx /Users/srithesh/.gemini/antigravity-ide/brain/5af1aa4f-ce6f-410b-85e9-cf33ad48bec6/scratch/scratch_test.ts
```

---

## Trade-offs

- **PostgreSQL Row Locking vs Redis:** We opted for PostgreSQL database-level row locking (`FOR UPDATE`) instead of Redis distributed locks. Since PostgreSQL is already the transactional database, keeping locks in PostgreSQL maintains ACID compliance, avoids dual-write consistency problems, and eliminates the need for external cache infrastructure.
- **DB-Based Idempotency Keys:** Storing idempotency keys directly in PostgreSQL keeps the architecture clean and simple to deploy, with zero external dependencies. In a ultra-high scale system, these keys could be offloaded to Redis with a TTL, but for this application, a PostgreSQL table is extremely reliable and persistent.