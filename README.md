# Sneaker Portfolio (Web App)

React Native app with StockX-style portfolio functionality:

- Adds shoe entries with shoe name, size, purchase date, and purchase price
- Automatically looks up a shoe image using Sneaks-API
- Shows all entries in a portfolio list (image on the left)
- Saves entries locally on your device using AsyncStorage

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
4. In a second terminal, start Expo:
   ```bash
   npm run start
   ```
5. Open with Expo Go on your phone (scan QR) or run Android/iOS simulator.

## Notes

- Image lookup uses a local Sneaks-API proxy server on port `4000` and falls back to a default sneaker image if no result is found.
- Purchase date is currently entered as text (`YYYY-MM-DD`) for speed and simplicity.
