# TradeVerse self-hosting

The repository is structured so the web app and API can be moved to your own Linux server. Live broker/exchange
execution stays behind `BROKER_EXECUTION_ENABLED` (default off) and an `OWNER_ID` check regardless of where you host it.

## What's actually implemented today

- **Data**: `artifacts/api-server/src/lib/store.ts` persists everything to **Firebase Firestore** (Admin SDK, server-side
  only - the app never talks to Firestore directly). Falls back to a local JSON file (`STORE_FILE=./data.json`) for
  testing, or pure in-memory (lost on restart) if neither is set. See `FIREBASE-SETUP.md`.
- **Auth**: OTP login (email via SMTP, SMS via your own gateway webhook), not Firebase Auth. Sessions are bearer
  tokens with a 7-day sliding idle expiry (`artifacts/api-server/src/routes/auth.ts`).
- **MySQL**: `infra/mysql/*.sql` is a schema for a *future* relational self-host path - tables for users, holdings,
  orders, watchlists, alerts, KYC docs, etc. **No driver code connects to it yet.** `store.ts` only knows Firestore
  and the local-JSON fallback above; there is no `MYSQL_URL` env var read anywhere in the running server. Treat the
  SQL files as a target schema to build against, not a working integration - don't point a server at them expecting
  data to show up.

## Server checklist (what actually works right now)

1. Install Node.js 24+ and pnpm on the server.
2. Copy `.env.example` to the API server's environment. At minimum set `OWNER_ID` (your own login email/phone) and
   leave `BROKER_EXECUTION_ENABLED=false` until broker credentials, risk controls, KYC, and regulatory approvals are
   complete.
3. Set `FIREBASE_SERVICE_ACCOUNT_B64` through your server's secret manager (see `FIREBASE-SETUP.md`). Do not commit
   the key.
4. Build the API with `pnpm --filter @workspace/api-server run build` and run it behind HTTPS (a reverse proxy or a
   Cloudflare Tunnel both work - `cloudflared tunnel --url http://localhost:<port>` is the fastest way to get a public
   HTTPS URL for testing without owning a domain).
5. Build the web app with `pnpm --filter @workspace/tradeverse run build` and serve `dist/public` behind the same
   domain, or reverse-proxy `/api` to the API server.
6. For the Android APK, set `API_URL` to that public HTTPS URL before running `mobile/prepare-android.mjs` and the
   Capacitor/Gradle build - see `README-APK.md`.

## If you want the MySQL path

Building it means replacing the Firestore/JSON `Backend` interface in `store.ts` with a MySQL-backed one (or adding
it as a second supported backend), then migrating `ledger.ts`, `wallet.ts`, `auth.ts`, `pay.ts`, `pending-orders.ts`,
and `watchlist.ts` off their in-memory `Map`s onto real queries against the `infra/mysql/*.sql` schema. That's a
genuine rewrite of the data layer, not a config change - budget accordingly before starting it.
