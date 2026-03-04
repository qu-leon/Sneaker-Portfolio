const express = require('express');
const cors = require('cors');
const { request, setGlobalDispatcher, ProxyAgent } = require('undici');

const app = express();
const port = 4000;
const KICKSDB_API_KEY = process.env.KICKSDB_API_KEY;
const KICKSDB_BASE_URL = process.env.KICKSDB_BASE_URL || 'https://api.kicks.dev';
const KICKSDB_MARKET = process.env.KICKSDB_MARKET || 'US';
const KICKSDB_CURRENCY = process.env.KICKSDB_CURRENCY || 'USD';

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60';

const getQueryFallbackImage = (query) => {
  return `https://source.unsplash.com/600x600/?${encodeURIComponent(query)},sneaker`;
};

const getKicksDbTopProduct = async (query) => {
  if (!KICKSDB_API_KEY) {
    return null;
  }

  try {
    const url = new URL('/v3/stockx/products', KICKSDB_BASE_URL);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', '1');
    url.searchParams.set('market', KICKSDB_MARKET);
    url.searchParams.set('currency', KICKSDB_CURRENCY);

    const response = await request(url, {
      method: 'GET',
      headers: {
        Authorization: KICKSDB_API_KEY,
      },
      bodyTimeout: 8000,
      headersTimeout: 8000,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return null;
    }

    const payload = await response.body.json();
    return Array.isArray(payload?.data) && payload.data.length > 0 ? payload.data[0] : null;
  } catch {
    return null;
  }
};

const getKicksDbImage = (product) => {
  if (!product || typeof product !== 'object') {
      return null;
    }

  const directFields = [
    product.image,
    product.imageUrl,
    product.thumbnail,
  ];

  for (const value of directFields) {
    if (typeof value === 'string' && value.startsWith('http')) {
      return value;
    }
  }

  if (Array.isArray(product.gallery)) {
    for (const value of product.gallery) {
      if (typeof value === 'string' && value.startsWith('http')) {
        return value;
      }
    }
  }

  return null;
};

app.use(cors());

process.on('uncaughtException', (error) => {
  console.error('Non-fatal Sneaks server error:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/search-image', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    res.status(400).json({ error: 'Query parameter q is required.' });
    return;
  }

  const topProduct = await getKicksDbTopProduct(query);
  const kicksDbImage = getKicksDbImage(topProduct);
  if (kicksDbImage) {
    res.json({ imageUrl: kicksDbImage, product: topProduct || null, source: 'kicksdb' });
    return;
  }

  res.json({
    imageUrl: getQueryFallbackImage(query),
    product: topProduct || null,
    source: 'query-fallback',
  });
});

app.listen(port, () => {
  console.log(`KicksDB image proxy listening on http://localhost:${port}`);
  if (!KICKSDB_API_KEY) {
    console.log('Warning: KICKSDB_API_KEY is not set. Using query-fallback images.');
  }
});
