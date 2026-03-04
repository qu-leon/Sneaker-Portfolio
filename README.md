# Sneaker Portfolio (React Web App)

React web app with StockX-style portfolio functionality:

- Adds shoe entries with shoe name, size, purchase date, and purchase price
- Automatically looks up a shoe image using Sneaks-API
- Shows all entries in a portfolio list (image on the left)
- Saves entries locally in browser localStorage

## Run locally

1. Install Node.js LTS (includes `npm`): https://nodejs.org/
2. In this folder, install dependencies:
   ```bash
   npm install
   ```
3. Start the Sneaks-API image server:
   ```bash
   npm run sneaks-api
   ```
4. In a second terminal, start the web app:
   ```bash
   npm run dev
   ```
5. Open the local URL shown by Vite (usually http://localhost:5173).

## Notes

- Image lookup uses a local Sneaks-API proxy server on port `4000` and falls back to a default sneaker image if no result is found.
- Purchase date is currently entered as text (`YYYY-MM-DD`) for speed and simplicity.

## Optional API host override

If your frontend and API are on different hosts, set `VITE_SNEAKS_API_BASE_URL` before running:

```bash
VITE_SNEAKS_API_BASE_URL=http://YOUR_HOST:4000 npm run dev
```
