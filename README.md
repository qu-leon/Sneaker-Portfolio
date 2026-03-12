# Sneaker Portfolio (Fullstack Web App)

## Project Description

Sneaker Portfolio is a fullstack web application inspired by StockX portfolio tracking. It allows users to log sneaker purchases, view their collection in a clean card-based list, and quickly search or manage entries.

On the frontend, the app is built with React + TypeScript (Vite) and includes a mobile-friendly UI with a floating action button, modal entry form, and keyboard-accessible interactions. Entry data is persisted in browser localStorage, with CSV import/export support for backup and transfer.

On the backend, a Node.js + Express API acts as a secure proxy to KicksDB for sneaker image lookup. This keeps API credentials off the client while providing reliable image retrieval and fallback behavior when no match is found.

StockX-style portfolio functionality:

- Adds shoe entries with shoe name, size, purchase date, and purchase price
- Automatically looks up a shoe image using KicksDB API
- Shows all entries in a portfolio list (image on the left)
- Saves entries locally in browser localStorage
- Export your data to Excel to transfer to other local machines as well

## Technologies Used
- Typescript
- React (Frontend)
- Node.js
- Express proxy (KicksDB API)

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

Before first deploy, add this repository secret:

- `VITE_SNEAKS_API_BASE_URL` = your hosted backend URL (for example, `https://your-api.example.com`)

This value is injected at build time so your Pages site can call your backend instead of `localhost`.

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
