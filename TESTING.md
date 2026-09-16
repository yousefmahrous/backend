# Testing

The backend uses [Vitest](https://vitest.dev) for unit tests. Business logic
lives in `*.service.js` files, and those are what's tested — routes stay thin
(they just call the service and return its `{ success, status, message, data }`
shape), so testing the service layer covers the actual decisions the app
makes without needing a real database.

## Running

```bash
npm test            # run once
npm run test:watch  # re-run on file changes while you work
npm run test:coverage
```

## How these tests are structured

Each service module gets a co-located `*.service.test.js` file. The
repository (`*.repository.js`, the only place that touches Prisma), Stripe,
Socket.io, and the email queue are all mocked with `vi.mock(...)` — no
database, network call, or real email is ever touched. This keeps tests fast
(the whole suite runs in well under a second) and focused on the service's
own logic: permission checks, status-transition rules, and error handling.

`src/test/helpers.js` exports `fakeT`, a stand-in for i18next's `t()`. It
returns the translation **key** instead of a translated string, so tests
assert on stable keys (`"refund.orderNotEligible"`) rather than on
human-readable text that will change whenever the wording or the active
locale changes.

## What's covered so far

- `src/modules/ticket/ticket.service.js` — permission checks (owner/admin),
  the "can't message a resolved ticket" guard, and the auto `pending`
  transition when a user replies.
- `src/modules/refund/refund.service.js` — the 14-day return window
  (including the boundary), the one-active-request-per-order rule, and the
  Stripe refund step (correct `payment_intent`, and that a Stripe failure
  returns `502` without ever calling `completeRefund` on the repository).

## What's not covered yet

`auth`, `order`, `payment`, `book`, `cart`, `favorite`, `review`, and
`contact` don't have tests yet. The pattern above (mock the repository +
external services, assert on the returned `{ success, status, message }`)
applies directly to all of them — `payment.service.js` (the Stripe webhook
handler) and `auth.service.js` (login/signup) are the next two worth doing,
since they're the highest-risk untested code in the app.

## Adding an integration test (routes + middleware, not just the service)

For a couple of the riskiest endpoints it's also worth testing through HTTP
with [supertest](https://github.com/forwardemail/supertest) (already
installed as a devDependency), e.g.:

```js
import request from 'supertest';
import app from '../src/app.js';

const res = await request(app).post('/api/v1/tickets').send({ subject: 'x', message: 'y' });
```

This wasn't set up yet because it needs a decision on how to fake
`req.session.user` for an authenticated request (either a test-only login
route, or a small Express middleware swapped in via `NODE_ENV=test`) —
worth a quick discussion before committing to one approach.
