# Marketplace API — Backend

REST + WebSocket API for a bilingual (Arabic / English) **multi-vendor e-commerce marketplace**. It handles authentication, catalog and variants, carts, Stripe checkout, per-vendor order fulfillment, commissions and payouts, refunds, and live support tickets.

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma_7-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-sessions%20%26%20queues-DC382D?logo=redis&logoColor=white)
![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [Business Rules](#business-rules)
- [Security](#security)
- [Testing](#testing)
- [Docker](#docker)
- [Continuous Integration](#continuous-integration)
- [Deployment Notes](#deployment-notes)
- [License](#license)

---

## Features

**Customers**
- Signup with email verification, login/logout, password reset and change
- Browse products with categories, variants (SKU, options, price, stock), ratings and popularity
- Cart and favorites, product reviews
- Checkout through **Stripe Checkout** with shipping details
- Order history, refund requests, and support tickets with real-time messaging

**Vendors**
- Apply to become a vendor; admin approves or rejects
- Manage own products and variants
- View and fulfill their share of an order (carrier, tracking number, shipped/delivered)
- Earnings overview, payout history, and per-vendor return handling

**Admins**
- Manage categories, products, vendors, and platform orders
- Configure the default commission and per-vendor overrides
- Record vendor payouts
- Review, approve, reject, and complete refunds
- Answer and update support tickets

**Platform**
- Full Arabic / English localization of API messages and emails
- Transactional emails through a background queue
- Image uploads via presigned URLs to S3-compatible storage (Backblaze B2)
- Structured logging with request IDs, health endpoint, graceful shutdown

---

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime / framework | Node.js 22, Express 5 (ES modules) |
| Database | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`) |
| Sessions / cache / rate limits | Redis (`express-session` + `connect-redis`, `rate-limit-redis`) |
| Background jobs | BullMQ (email queue + worker) |
| Payments | Stripe (Checkout + webhooks) |
| Email | Resend |
| File storage | Backblaze B2 through the AWS S3 SDK (presigned uploads) |
| Real-time | Socket.IO |
| Validation | Zod |
| i18n | i18next (`ar`, `en`) |
| Security | Helmet, CORS allow-list, double-submit CSRF (`csrf-csrf`), bcrypt, rate limiting |
| Logging | pino + pino-http |
| Testing | Vitest (+ v8 coverage) |

---

## Architecture

The code is organized by **feature module**, with a strict three-layer split inside each module:

```
HTTP request
    │
    ▼
routes/v1/*.routes.js      ← thin: auth, CSRF, validation, call the service
    │
    ▼
modules/<x>/<x>.service.js ← business rules, permissions, orchestration
    │
    ▼
modules/<x>/<x>.repository.js ← the only layer that talks to Prisma
```

Services return a uniform `{ success, status, message, data }` shape, which keeps routes trivial and makes services easy to unit test by mocking the repository, Stripe, Socket.IO, and the email queue.

---

## Project Structure

```
.
├── prisma/
│   ├── schema.prisma            # Data model
│   └── migrations/              # SQL migrations
├── scripts/
│   ├── seed-e2e.js              # Seeds test users and a sample catalog
│   ├── seed-paid-order.js       # Creates a paid order for testing
│   └── simulate-stripe-webhook.js
├── src/
│   ├── app.js                   # Express + Socket.IO bootstrap
│   ├── core/
│   │   ├── config/              # session, csrf, redis, s3, stripe, socket, queue
│   │   ├── i18n/                # i18next setup + ar/en locales
│   │   ├── middlewares/         # auth, admin, vendor, rate limiters, validation
│   │   ├── services/            # email and file services
│   │   ├── email.queue.js / email.worker.js
│   │   ├── db.js                # Prisma client
│   │   └── logger.js
│   ├── modules/                 # auth, cart, category, commission, contact,
│   │                            # favorite, order, payment, payout, product,
│   │                            # refund, review, settings, ticket, upload, vendor
│   ├── routes/v1/               # Route definitions mounted at /api/v1
│   └── test/helpers.js          # Test utilities (fakeT)
├── Dockerfile                   # Multi-stage build (deps → migrator → runtime)
├── prisma.config.js
├── vitest.config.js
└── TESTING.md
```

---

## Getting Started

### Prerequisites

- **Node.js 22+** and npm
- **PostgreSQL** 14+ (16 recommended)
- **Redis** 7+
- A **Stripe** account (test mode is fine) and the Stripe CLI for local webhooks
- A **Resend** API key (emails)
- An **S3-compatible bucket** such as Backblaze B2 (product image uploads)

### Installation

```bash
git clone https://github.com/yousefmahrous/backend.git
cd backend
npm install          # also runs `prisma generate`
```

### Configure the environment

Create a `.env` file in the project root (see [Environment Variables](#environment-variables)). Never commit it.

### Set up the database

```bash
npm run migrate:deploy
```

### Run the server

```bash
npm run dev          # nodemon, auto-reload
# or
npm start            # applies pending migrations, then starts the server
```

The API is available at `http://localhost:3000` (or your `PORT`). Check it with:

```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":12.34}
```

### Forward Stripe webhooks locally

```bash
stripe listen --forward-to localhost:3000/api/v1/payment/webhook
```

Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`.

### Seed sample data (optional)

```bash
npm run seed:e2e
```

Creates a customer, an admin, and a sample catalog. The credentials are defined in `scripts/seed-e2e.js`; use them for local development only.

---

## Environment Variables

| Variable | Required | Description |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string (`rediss://` enables TLS) |
| `SESSION_SECRET` | ✅ | Secret for session cookies and CSRF tokens |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret |
| `RESEND_API_KEY` | ✅ | Resend API key for transactional emails |
| `CONTACT_RECEIVER_EMAIL` | ✅ | Inbox that receives contact-form messages |
| `B2_ACCESS_KEY_ID` | ✅ | Storage access key |
| `B2_SECRET_ACCESS_KEY` | ✅ | Storage secret key |
| `B2_BUCKET_NAME` | ✅ | Bucket for product images |
| `B2_ENDPOINT` | ✅ | S3-compatible endpoint URL |
| `CLIENT_URL_DEV` | ✅ | Allowed frontend origin (CORS + Socket.IO) |
| `CLIENT_URL_DEV_2` … `_4` | ➖ | Additional allowed origins |
| `PORT` | ➖ | HTTP port (default `3000`) |
| `NODE_ENV` | ➖ | `development`, `test`, or `production` |
| `DISABLE_RATE_LIMIT` | ➖ | Set to `true` to bypass rate limiters (tests / e2e only) |

> **Production note:** with `NODE_ENV=production` cookies are set `Secure` with `SameSite=None`, so the API and frontend must be served over HTTPS.

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with nodemon |
| `npm run dev:test` | Start with rate limiting disabled (used for e2e runs) |
| `npm start` | Run `prisma migrate deploy`, then start the server |
| `npm run migrate:deploy` | Apply pending migrations |
| `npm run seed:e2e` | Seed test users and sample catalog |
| `npm test` | Run unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

---

## API Overview

Base URL: `/api/v1`. All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a CSRF token in the `x-csrf-token` header, obtained from `GET /api/v1/csrf-token`. Send `x-lang: ar | en` to choose the response language.

| Resource | Prefix | Highlights |
| --- | --- | --- |
| Auth | `/auth` | `signup`, `login`, `logout`, `me`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `change-password` |
| Products | `/products` | Public list, `popular`, detail; admin create/update/delete and variants |
| Categories | `/categories` | Public list; admin create/update/delete |
| Cart | `/cart` | Get cart; add, update, remove items |
| Favorites | `/favorites` | List, add, remove |
| Reviews | `/reviews` | `products/:productId` list, create, delete |
| Payment | `/payment` | `checkout` (Stripe session), `webhook` (Stripe events) |
| Orders | `/orders` | Customer orders, `latest`, detail, `admin/all` |
| Refunds | `/refunds` | Create, `mine`, admin `approve` / `reject` / `cancel` / `complete` |
| Tickets | `/tickets` | Create, `mine`, messages, admin status updates (+ Socket.IO) |
| Vendors | `/vendors` | `apply`, `me`, vendor products/orders/returns/earnings/payouts, admin management and platform orders |
| Payouts | `/payouts` | Admin balances, history, and recording payouts per vendor |
| Settings | `/settings` | Platform commission and payout-hold configuration |
| Contact | `/contact` | Public contact form |
| Upload | `/upload` | Presigned upload URL (admin or vendor) |
| Health | `/health` | Liveness probe (outside `/api/v1`) |

**Real-time events (Socket.IO):** ticket rooms (`join_ticket`) for live support chat, and a `products_updated` event that tells clients to refresh catalog data.

---

## Business Rules

- **Money** is stored as integers in minor units (default currency `egp`).
- **Order splitting:** a paid order is split into one `VendorOrder` per vendor, each with its own fulfillment status, tracking, and commission snapshot.
- **Commission:** stored in basis points (`1000` = 10 %). Resolution order: platform-owned vendor → `0`, vendor override, then the platform default (10 %). The rate is snapshotted on each vendor order so later changes do not alter past sales.
- **Payouts:** earnings become payable after a hold period (default 14 days, configurable up to 90). Admins record payouts against vendors.
- **Refunds:** customers can request a refund within **14 days**, one active request per order. Approving and completing a refund issues the Stripe refund for the correct payment intent.
- **Orders** move through statuses such as `pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, and `refunded`.

---

## Security

- Helmet with a locked-down Content Security Policy
- Session cookies (`httpOnly`, `Secure` in production) stored in Redis with a 24 h TTL
- Double-submit CSRF protection on all mutating routes
- Redis-backed rate limiting (login, signup, password reset, verification resend, contact, checkout, plus a global limiter)
- bcrypt password hashing; reset and verification tokens with expiry
- Strict CORS allow-list with credentials
- Stripe webhook signature verification on the raw request body
- Request IDs on every log line; non-root user and health check in Docker

---

## Testing

Unit tests use [Vitest](https://vitest.dev) and live next to the code as `*.test.js`. Services are tested in isolation: repositories, Stripe, Socket.IO, and the email queue are mocked, so no database or network is required. `fakeT` in `src/test/helpers.js` returns translation keys so assertions stay stable across wording and locale changes.

```bash
npm test
npm run test:coverage
```

See [TESTING.md](./TESTING.md) for conventions. End-to-end tests live in the frontend repository and run against this API.

---

## Docker

The `Dockerfile` is a multi-stage build:

| Stage | Purpose |
| --- | --- |
| `deps` | Installs all dependencies and generates the Prisma client |
| `migrator` | One-shot image that runs `prisma migrate deploy` |
| `prod-deps` | Prunes dev dependencies |
| `runtime` | Final slim image, runs as the non-root `node` user with a health check |

```bash
# Build and run the API
docker build -t marketplace-api .
docker run --env-file .env -p 3000:3000 marketplace-api

# Run migrations with the migrator target
docker build --target migrator -t marketplace-migrator .
docker run --env-file .env marketplace-migrator
```

The runtime image starts `node src/app.js` directly so `SIGTERM` is handled for graceful shutdown. Run migrations as a separate step before rolling out a new version.

---

## Continuous Integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests: installs dependencies on Node 22, runs `npm run test:coverage`, and uploads the coverage report as an artifact.

---

## Deployment Notes

- Run the app behind a reverse proxy or platform load balancer (`trust proxy` is enabled).
- Register `https://<your-api>/api/v1/payment/webhook` as a Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
- Add your frontend URL to `CLIENT_URL_DEV` so CORS, cookies, and Socket.IO work.
- Provide Redis and PostgreSQL connection strings through your platform's secret manager, not through committed files.

---

## License

ISC © Youssef Mahrous
