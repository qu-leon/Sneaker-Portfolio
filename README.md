# Sneaker Portfolio (Fullstack Web App)

## Project Description

Sneaker Portfolio is a fullstack web application inspired by StockX portfolio tracking. It allows users to log sneaker purchases, view their collection in a clean card-based list, and quickly search or manage entries.

On the frontend, the app is built with React + TypeScript (Vite) and includes a mobile-friendly UI with a floating action button, modal entry form, and keyboard-accessible interactions. Entry data is stored in Supabase behind email sign-in, so the same collection is available on every device, with Excel import/export support for backup and transfer.

On the backend, a Node.js + Express API acts as a secure proxy to KicksDB for sneaker image lookup. This keeps API credentials off the client while providing reliable image retrieval and fallback behavior when no match is found.

StockX-style portfolio functionality:

- Adds shoe entries with shoe name, size, purchase date, and purchase price
- Automatically looks up a shoe image using KicksDB API
- Shows all entries in a portfolio list (image on the left)
- Saves entries to the cloud (Supabase) so they sync across devices
- Export your data to Excel to transfer to other local machines as well

## Technologies Used
- Typescript
- React (Frontend)
- Node.js
- Express proxy (KicksDB API)
- Supabase (Postgres + Auth)

## Supabase setup

1. Create a project at https://supabase.com.
2. In **SQL Editor**, run [supabase/schema.sql](supabase/schema.sql) to create the tables and row-level security policies.
3. In **Authentication > Sign In / Providers > Email**, turn off **Confirm email** so accounts work without Supabase sending any email. After creating your account in the app, you can also turn off **Allow new users to sign up** to keep the app private.
4. From **Project Settings > API**, copy the project URL and anon/publishable key into a `.env.local` file:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

The anon key is safe to ship to the browser; row-level security restricts each user to their own rows. Entries saved by the older localStorage version are uploaded automatically the first time you sign in on that device (only if your cloud collection is still empty).

## Run locally

1. Install Node.js LTS (includes `npm`): https://nodejs.org/
2. In this folder, install dependencies:
   ```bash
   npm install
   ```
3. Set your KicksDB API key in your terminal:
   ```bash
   KICKSDB_API_KEY=your_kicksdb_api_key
   ```
4. Start the KicksDB image server:
   ```bash
   npm run kicksdb-api
   ```
5. In a second terminal, start the web app:
   ```bash
   npm run dev
   ```
6. Open the local URL shown by Vite (usually http://localhost:5173).

## Notes

- Image lookup tries KicksDB first and falls back to a query-based fallback image URL if no KicksDB image is available.
- Purchase date uses the browser date picker and defaults to today.

## KicksDB setup

Set these environment variables before starting `npm run kicksdb-api`:

```bash
KICKSDB_API_KEY=your_kicksdb_api_key
KICKSDB_BASE_URL=https://api.kicks.dev
KICKSDB_MARKET=US
KICKSDB_CURRENCY=USD
```

Only `KICKSDB_API_KEY` is required. Without it, the server skips KicksDB and falls back to query-based image URLs.

## Optional API host override

If your frontend and API are on different hosts, set `VITE_SNEAKS_API_BASE_URL` before running:

```bash
VITE_SNEAKS_API_BASE_URL=http://YOUR_HOST:4000 npm run dev
```

## GitHub Pages deployment (GitHub Actions)

The workflow in `.github/workflows/builddeploy.yaml` deploys on push to `main`.

Before first deploy, add these repository secrets:

- `VITE_SNEAKS_API_BASE_URL` = your hosted backend URL (for example, `https://your-api.example.com`)
- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon/publishable key

These values are injected at build time.

## Deploy backend on Render

1. Push this repo to GitHub (includes `render.yaml`).
2. In Render, click **New** → **Blueprint** and select this repository.
3. Render will detect `render.yaml` and create `sneaker-portfolio-kicksdb-api`.
4. In the service environment variables, set:
   - `KICKSDB_API_KEY` = your KicksDB API key
5. Deploy and copy the public Render URL, for example:
   - `https://sneaker-portfolio-kicksdb-api.onrender.com`
6. Test backend endpoints:
   - `https://YOUR_RENDER_URL/health`
   - `https://YOUR_RENDER_URL/search-image?q=Jordan%201`
7. Set GitHub repository secret `VITE_SNEAKS_API_BASE_URL` to this Render URL, then push to `main` to redeploy Pages.

## Testing and security checks

```powershell
npm run test:run
npm run test:typecheck
npm run test:security
```

The full suite includes React component tests and Node security tests. `test:security` runs the Node API, bundle, and Supabase suites; component security cases are also included in `test:run`.

- [src/App.test.tsx](src/App.test.tsx): sign-in failures, session-loss privacy, rejected email-link responses, password-reset account-enumeration protection, stored markup escaping, and unsafe image lookup schemes. Supabase and image lookups are mocked; these checks do not prove real token expiry or database authorization.
- [tests/api.security.test.ts](tests/api.security.test.ts): real HTTP requests to a temporary loopback Express server, with KicksDB mocked. Checks input handling, bounded result counts, upstream URL containment/timeouts, image schemes, and credential/error leakage. It never uses the real KicksDB key or quota.
- [tests/secrets.security.test.ts](tests/secrets.security.test.ts): an in-memory Vite build with fake credential canaries verifies that server-only keys stay out of browser output. The public Supabase anon/publishable key is intentionally allowed. This is not a complete scan of existing credentials or Git history.
- [tests/supabase.security.test.ts](tests/supabase.security.test.ts): configuration guards always run. Real RLS/Auth tests are opt-in and verify both collection tables using two ordinary users, anonymous requests, forged ownership, cross-user writes, and direct database validation.

### Local Supabase security tests

Use a disposable local Supabase instance with Docker and the Supabase CLI. Apply [supabase/schema.sql](supabase/schema.sql) to that local instance, then create two distinct, confirmed, ordinary test accounts. The suite does not create or delete accounts.

Supply the following values in your private terminal environment or CI secret store. Do not commit credentials. These variables are not automatically loaded from `.env.local`.

```powershell
$env:RUN_SUPABASE_SECURITY_TESTS = '1'
$env:SECURITY_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:SECURITY_SUPABASE_ANON_KEY = '<local anon or publishable key>'
$env:SECURITY_SUPABASE_USER_A_EMAIL = '<first local test email>'
$env:SECURITY_SUPABASE_USER_A_PASSWORD = '<first local test password>'
$env:SECURITY_SUPABASE_USER_B_EMAIL = '<second local test email>'
$env:SECURITY_SUPABASE_USER_B_PASSWORD = '<second local test password>'
npm run test:security -- tests/supabase.security.test.ts
Remove-Item Env:RUN_SUPABASE_SECURITY_TESTS
```

Only loopback URLs are accepted, and secret/service-role keys are rejected because they bypass RLS. Test rows use unique IDs and are cleaned up afterward, including after assertion failures. If the process is forcibly terminated, only rows with the `security-test-` prefix should need manual cleanup. Without explicit opt-in, live database tests are reported as skipped, not passed.

### Dependency and repository secret scans

```powershell
npm run security:audit
npm run security:secrets
```

The audit command contacts the npm registry and exits nonzero when advisories are found; it does not upgrade dependencies. The secret command requires [Gitleaks](https://github.com/gitleaks/gitleaks) on PATH and scans Git history with redacted output. It does not cover uncommitted files. Neither scanner is replaced by the browser-bundle canary test.

### Outstanding security coverage

The API currently has no explicit access control or rate limiting and permits all browser origins. API tests record TODOs for an access policy, rate limiting, oversized/structured query rejection, and an intended CORS allowlist. These TODOs are outstanding protections, not successful security checks.

Real access-token expiry and expired/reused recovery links remain a TODO requiring a controlled Auth/mail environment. The component tests only simulate Auth rejection and session loss. No real-browser security tests are included, so browser execution behavior and a complete authentication round trip remain unverified. Supabase sign-out should not be assumed to immediately revoke already-issued access JWTs.
