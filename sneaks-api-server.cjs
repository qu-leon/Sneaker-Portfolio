const express = require('express');
const cors = require('cors');
const SneaksAPI = require('sneaks-api');

const app = express();
const sneaks = new SneaksAPI();
const port = 4000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60';

const getQueryFallbackImage = (query) => {
  return `https://source.unsplash.com/600x600/?${encodeURIComponent(query)},sneaker`;
};

const getSneaksTopProduct = (query) => {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 8000);

    try {
      sneaks.getProducts(query, 5, (error, products) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);

        if (error || !Array.isArray(products) || products.length === 0) {
          resolve(null);
          return;
        }

        resolve(products[0]);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        resolve(null);
      }
    }
  });
};

const getGoogleImage = async (query) => {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    return null;
  }

  try {
    const searchText = `${query} sneaker`;
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
        GOOGLE_API_KEY
      )}&cx=${encodeURIComponent(GOOGLE_CSE_ID)}&searchType=image&num=1&safe=active&q=${encodeURIComponent(
        searchText
      )}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const firstResult = Array.isArray(data?.items) ? data.items[0] : null;
    const imageUrl = firstResult?.link;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      return imageUrl;
    }

    const firstImage = firstResult?.image?.thumbnailLink;
    if (typeof firstImage === 'string' && firstImage.startsWith('http')) {
      return firstImage;
    }

    return null;
  } catch {
    return null;
  }
};

const getSneaksImage = (product) => {
  if (!product || typeof product !== 'object') {
      return null;
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

  const topProduct = await getSneaksTopProduct(query);
  const sneaksImage = getSneaksImage(topProduct);
  if (sneaksImage) {
    res.json({ imageUrl: sneaksImage, product: topProduct || null, source: 'sneaks-api' });
    return;
  }

  const googleImage = await getGoogleImage(query);
  if (googleImage) {
    res.json({ imageUrl: googleImage, product: topProduct || null, source: 'google-images' });
    return;
  }

  res.json({
    imageUrl: getQueryFallbackImage(query),
    product: topProduct || null,
    source: 'query-fallback',
  });
});

app.listen(port, () => {
  console.log(`Sneaks API proxy listening on http://localhost:${port}`);
});
