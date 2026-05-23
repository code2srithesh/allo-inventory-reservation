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

The most important part of this assignment is preventing overselling.

The reservation endpoint runs inside a database transaction.

Before creating a reservation, it checks available stock:

availableUnits = totalUnits - reservedUnits

Then it performs an atomic conditional update on the stock row.

If two checkout requests arrive at the same time for the last available unit, only one request can successfully increment reservedUnits.

The second request receives HTTP 409.

This prevents two customers from reserving the same physical unit.

## API Routes

### GET /api/products

Lists products with available stock per warehouse.

### GET /api/warehouses

Lists warehouses.

### POST /api/reservations

Creates a pending reservation.

Returns 409 if there is not enough stock.

### GET /api/reservations/:id

Fetches a reservation by ID.

### POST /api/reservations/:id/confirm

Confirms the reservation.

If the reservation has expired, it returns 410.

### POST /api/reservations/:id/release

Releases the reservation early.

### GET /api/cron/release-expired

Releases expired pending reservations.

## Expiry Mechanism

Each reservation expires after 10 minutes.

In production, expired reservations can be released using a Vercel Cron job that calls:

/api/cron/release-expired

This endpoint finds pending reservations where expiresAt is in the past, marks them as released, and decrements reservedUnits.

## Local Setup

Clone the repository:

```bash
git clone your-repo-url
cd allo-inventory-reservation

## Trade-offs

- Redis locking was not used because the database-level atomic conditional update is enough for this focused assignment.
- Idempotency-Key support was not implemented because it was optional.
- The UI currently reserves one unit at a time to keep the checkout flow simple.
- Expired reservation cleanup is implemented using a cron-compatible API endpoint instead of a dedicated background worker.
- Authentication is not included because the assignment focuses on inventory and reservation correctness.