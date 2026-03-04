import { FormEvent, useEffect, useMemo, useState } from 'react';

type SneakerEntry = {
  id: string;
  shoeName: string;
  size: string;
  purchaseDate: string;
  purchasePrice: number;
  imageUrl: string;
};

const STORAGE_KEY = 'sneaker-portfolio-entries-v1';
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60';

const getSneaksApiBaseUrl = () => {
  const envValue = (import.meta.env.VITE_SNEAKS_API_BASE_URL as string | undefined)?.trim();
  if (envValue) {
    return envValue;
  }

  return `${window.location.protocol}//${window.location.hostname}:4000`;
};

export default function App() {
  const [shoeName, setShoeName] = useState('');
  const [size, setSize] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [entries, setEntries] = useState<SneakerEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SneakerEntry[];
        setEntries(parsed);
      }
    } catch {
      console.warn('Could not load saved entries');
    }
  }, []);

  const totalInvested = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.purchasePrice, 0),
    [entries]
  );

  const persistEntries = (nextEntries: SneakerEntry[]) => {
    setEntries(nextEntries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  };

  const findSneakerImage = async (query: string): Promise<string> => {
    try {
      const apiBaseUrl = getSneaksApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/search-image?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        return FALLBACK_IMAGE;
      }

      const data = await response.json();
      if (typeof data?.imageUrl === 'string' && data.imageUrl.startsWith('http')) {
        return data.imageUrl;
      }

      return FALLBACK_IMAGE;
    } catch {
      return FALLBACK_IMAGE;
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!shoeName.trim() || !size.trim() || !purchaseDate.trim() || !purchasePrice.trim()) {
      window.alert('Please fill in shoe, size, purchase date, and purchase price.');
      return;
    }

    const parsedPrice = Number(purchasePrice);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      window.alert('Purchase price must be a positive number.');
      return;
    }

    setIsSaving(true);
    try {
      const imageUrl = await findSneakerImage(shoeName.trim());
      const newEntry: SneakerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shoeName: shoeName.trim(),
        size: size.trim(),
        purchaseDate: purchaseDate.trim(),
        purchasePrice: parsedPrice,
        imageUrl,
      };

      persistEntries([newEntry, ...entries]);
      setShoeName('');
      setSize('');
      setPurchaseDate('');
      setPurchasePrice('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="page">
      <div className="container">
        <h1 className="title">Sneaker Portfolio</h1>

        <form className="card form" onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Shoe name (e.g. Jordan 1 Chicago)"
            value={shoeName}
            onChange={(event) => setShoeName(event.target.value)}
          />
          <input
            className="input"
            placeholder="Size"
            value={size}
            onChange={(event) => setSize(event.target.value)}
          />
          <input
            className="input"
            placeholder="Purchase date (YYYY-MM-DD)"
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
          />
          <input
            className="input"
            placeholder="Purchase price"
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
          />
          <button className="button" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add to Portfolio'}
          </button>
        </form>

        <p className="summary">
          {entries.length} pair{entries.length === 1 ? '' : 's'} • Total invested: ${totalInvested.toFixed(2)}
        </p>

        <section className="list">
          {entries.length === 0 ? (
            <p className="empty">No shoes yet. Add your first pair above.</p>
          ) : (
            entries.map((entry) => (
              <article className="card entry" key={entry.id}>
                <img className="thumb" src={entry.imageUrl || FALLBACK_IMAGE} alt={entry.shoeName} />
                <div>
                  <h3 className="shoeName">{entry.shoeName}</h3>
                  <p className="meta">Size: {entry.size}</p>
                  <p className="meta">Date: {entry.purchaseDate}</p>
                  <p className="price">Paid: ${entry.purchasePrice.toFixed(2)}</p>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
