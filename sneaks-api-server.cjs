const express = require('express');
const cors = require('cors');
const SneaksAPI = require('sneaks-api');

const app = express();
const sneaks = new SneaksAPI();
const port = 4000;

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60';

const extractImageUrl = (product) => {
  if (!product || typeof product !== 'object') {
    return FALLBACK_IMAGE;
  }

  const directFields = [
    product.thumbnail,
    product.image,
    product.imageUrl,
    product.smallImageUrl,
    product.shoeImage,
  ];

  for (const value of directFields) {
    if (typeof value === 'string' && value.startsWith('http')) {
      return value;
    }
  }

  if (Array.isArray(product.imageLinks)) {
    for (const value of product.imageLinks) {
      if (typeof value === 'string' && value.startsWith('http')) {
        return value;
      }
    }
  }

  return FALLBACK_IMAGE;
};

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/search-image', (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    res.status(400).json({ error: 'Query parameter q is required.' });
    return;
  }

  sneaks.getProducts(query, 5, (error, products) => {
    if (error) {
      res.status(500).json({ error: 'Sneaks-API lookup failed.', imageUrl: FALLBACK_IMAGE });
      return;
    }

    const topProduct = Array.isArray(products) && products.length > 0 ? products[0] : undefined;
    const imageUrl = extractImageUrl(topProduct);
    res.json({ imageUrl, product: topProduct || null });
  });
});

app.listen(port, () => {
  console.log(`Sneaks API proxy listening on http://localhost:${port}`);
});
