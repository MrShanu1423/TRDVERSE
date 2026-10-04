# TradeVerse

TradeVerse is a unified Indian investing workspace for tracking crypto, stocks, funds, and paper orders in one clear dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/tradeverse run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Self-hosting notes: `docs/SELF_HOSTING.md`
- Database setup: `FIREBASE-SETUP.md`
- Live broker/exchange execution is disabled by default (`BROKER_EXECUTION_ENABLED`) and owner-only (`OWNER_ID`) even when enabled.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`) - real paper-trading engine (`routes/ledger.ts`, `routes/trade.ts`,
  `routes/pending-orders.ts`), live crypto prices (Binance, keyless), live stock prices (Angel One, needs keys),
  wallet/transfers demo ledger, Razorpay UPI funding, watchlists + price alerts.
- Data: Firebase Firestore via Admin SDK (server-side only), see `FIREBASE-SETUP.md`. `infra/mysql/*.sql` is a
  schema for a *future* relational self-host path - no MySQL driver code exists yet, don't assume it's wired up.
- Auth: OTP login (email/SMS), bearer-token sessions with a 7-day sliding idle expiry.
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) - covers the legacy demo endpoints (dashboard/portfolio/markets/orders);
  the real engine (auth/trade/wallet/pay/live/watchlist) is called directly via fetch, not yet in the spec.
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/tradeverse/src/` — responsive React/Vite product UI
- `artifacts/api-server/src/routes/` — all API routes; `ledger.ts`/`trade.ts`/`pending-orders.ts` are the real paper
  engine, `dashboard.ts`/`portfolio.ts`/`markets.ts`/`orders.ts` are the legacy demo-data routes (now wired to read
  from the real engine too, via `portfolio-calc.ts`)
- `lib/api-spec/openapi.yaml` — API contract (legacy endpoints only, see Stack note above)
- `infra/mysql/*.sql` — future self-host schema, not yet connected to any driver
- `docs/SELF_HOSTING.md` — deployment notes, accurate as of the current architecture

## Architecture decisions

- Live broker/exchange execution remains paper-only until authentication, risk controls, KYC, and regulatory
  requirements are configured - and even then, it's gated to `OWNER_ID` only, never any signed-up user.
- The API is contract-first for the legacy endpoints: OpenAPI generates both frontend hooks and server validation
  schemas. The real engine was built faster than the spec and isn't in it yet (see Stack note).

## Product

The app provides a dashboard, live markets (crypto + NSE stocks), a real paper-trading engine with market/limit/stop
orders and an order book, portfolio allocation and holdings, watchlists and price alerts, a wallet/transfer demo
ledger, Razorpay UPI funding, and a profile view with infrastructure readiness. It is intentionally safe for product
validation and does not move real money unless `BROKER_EXECUTION_ENABLED` + `OWNER_ID` are both explicitly set by
the deployer for their own account.

## User preferences

- The user plans to self-host the server on a physical RAC server and requested MySQL plus Firebase as the production integration direction.

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Do not enable broker execution without replacing the demo provider and adding verified auth/risk/compliance controls.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
