import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

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

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getSneaksApiBaseUrl = () => {
  const envValue = (import.meta.env.VITE_SNEAKS_API_BASE_URL as string | undefined)?.trim();
  if (envValue) {
    return envValue;
  }

  return `${window.location.protocol}//${window.location.hostname}:4000`;
};

export default function App() {
  const [shoeName, setShoeName] = useState('');
  const [size, setSize] = useState('10');
  const [purchaseDate, setPurchaseDate] = useState(getTodayDate());
  const [purchasePrice, setPurchasePrice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEntryFormOpen, setIsEntryFormOpen] = useState(false);
  const [entries, setEntries] = useState<SneakerEntry[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const floatingFormPanelRef = useRef<HTMLElement | null>(null);
  const floatingAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectAllEntriesRef = useRef<HTMLInputElement | null>(null);

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

  const selectedCount = selectedEntryIds.length;
  const areAllEntriesSelected = entries.length > 0 && selectedCount === entries.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < entries.length;

  const filteredEntries = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return entries;
    }

    return entries.filter((entry) => {
      const searchableText = [entry.shoeName, entry.size, entry.purchaseDate]
        .join(' ')
        .toLowerCase();
      return searchableText.includes(keyword);
    });
  }, [entries, searchTerm]);

  const sizeOptions = useMemo(() => {
    const options: string[] = [];
    for (let value = 3; value <= 15; value += 0.5) {
      const label = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
      options.push(label);
    }
    return options;
  }, []);

  const persistEntries = (nextEntries: SneakerEntry[]) => {
    setEntries(nextEntries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  };

  useEffect(() => {
    setSelectedEntryIds((previousSelectedIds) => {
      const validEntryIds = new Set(entries.map((entry) => entry.id));
      return previousSelectedIds.filter((entryId) => validEntryIds.has(entryId));
    });
  }, [entries]);

  useEffect(() => {
    if (!selectAllEntriesRef.current) {
      return;
    }

    selectAllEntriesRef.current.indeterminate = isPartiallySelected;
  }, [isPartiallySelected]);

  useEffect(() => {
    if (!isEntryFormOpen) {
      return;
    }

    const previouslyFocusedElement = document.activeElement as HTMLElement | null;
    const panelElement = floatingFormPanelRef.current;
    const getFocusableElements = () => {
      if (!panelElement) {
        return [] as HTMLElement[];
      }

      const focusableSelector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(panelElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute('disabled')
      );
    };

    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      panelElement?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsEntryFormOpen(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const currentFocusableElements = getFocusableElements();
      if (currentFocusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = currentFocusableElements[0];
      const lastElement = currentFocusableElements[currentFocusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !panelElement?.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement || !panelElement?.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocusedElement) {
        previouslyFocusedElement.focus();
      } else {
        floatingAddButtonRef.current?.focus();
      }
    };
  }, [isEntryFormOpen]);

  const onOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!floatingFormPanelRef.current) {
      return;
    }

    if (!floatingFormPanelRef.current.contains(event.target as Node)) {
      setIsEntryFormOpen(false);
    }
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
      setSize('10');
      setPurchaseDate(getTodayDate());
      setPurchasePrice('');
      setIsEntryFormOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const onDeleteEntry = (entryId: string) => {
    const shouldDelete = window.confirm('Are you sure you want to delete this entry?');
    if (!shouldDelete) {
      return;
    }

    const nextEntries = entries.filter((entry) => entry.id !== entryId);
    persistEntries(nextEntries);
  };

  const onToggleEntrySelected = (entryId: string) => {
    setSelectedEntryIds((previousSelectedIds) => {
      const isSelected = previousSelectedIds.includes(entryId);
      if (isSelected) {
        return previousSelectedIds.filter((id) => id !== entryId);
      }
      return [...previousSelectedIds, entryId];
    });
  };

  const onDeleteSelectedEntries = () => {
    if (selectedEntryIds.length === 0) {
      return;
    }

    const confirmationMessage = areAllEntriesSelected
      ? 'Are you sure you want to delete all entries?'
      : `Are you sure you want to delete ${selectedEntryIds.length} selected entr${selectedEntryIds.length === 1 ? 'y' : 'ies'}?`;

    const shouldDelete = window.confirm(confirmationMessage);
    if (!shouldDelete) {
      return;
    }

    const selectedIdSet = new Set(selectedEntryIds);
    const nextEntries = entries.filter((entry) => !selectedIdSet.has(entry.id));
    persistEntries(nextEntries);
    setSelectedEntryIds([]);
  };

  const onToggleAllEntriesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedEntryIds(entries.map((entry) => entry.id));
      return;
    }

    setSelectedEntryIds([]);
  };

  const onExportEntries = () => {
    if (entries.length === 0) {
      window.alert('No entries to export yet.');
      return;
    }

    const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Shoe Name', 'Size', 'Purchase Date', 'Purchase Price', 'Image URL'];
    const rows = entries.map((entry) => [
      entry.shoeName,
      entry.size,
      entry.purchaseDate,
      entry.purchasePrice.toFixed(2),
      entry.imageUrl,
    ]);

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateLabel = getTodayDate();
    anchor.href = url;
    anchor.download = `sneaker-portfolio-${dateLabel}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const parseCsvLine = (line: string) => {
    const fields: string[] = [];
    let currentField = '';
    let isInQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"') {
        if (isInQuotes && nextChar === '"') {
          currentField += '"';
          index += 1;
        } else {
          isInQuotes = !isInQuotes;
        }
        continue;
      }

      if (char === ',' && !isInQuotes) {
        fields.push(currentField);
        currentField = '';
        continue;
      }

      currentField += char;
    }

    fields.push(currentField);
    return fields.map((field) => field.trim());
  };

  const onImportButtonClick = () => {
    importFileInputRef.current?.click();
  };

  const onImportEntries = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const normalizedText = rawText.replace(/^\uFEFF/, '');
      const lines = normalizedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        window.alert('The selected file has no data rows to import.');
        return;
      }

      const header = parseCsvLine(lines[0]);
      const expectedHeader = ['Shoe Name', 'Size', 'Purchase Date', 'Purchase Price', 'Image URL'];
      const isExpectedHeader =
        header.length === expectedHeader.length &&
        header.every((column, index) => column === expectedHeader[index]);

      if (!isExpectedHeader) {
        window.alert('Invalid file format. Please import a file exported by this app.');
        return;
      }

      const importedEntries: SneakerEntry[] = [];
      for (const line of lines.slice(1)) {
        const [shoe, sizeValue, dateValue, priceValue, imageValue] = parseCsvLine(line);
        const parsedPrice = Number(priceValue);

        if (!shoe || !sizeValue || !dateValue || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          continue;
        }

        importedEntries.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          shoeName: shoe,
          size: sizeValue,
          purchaseDate: dateValue,
          purchasePrice: parsedPrice,
          imageUrl: imageValue || FALLBACK_IMAGE,
        });
      }

      if (importedEntries.length === 0) {
        window.alert('No valid rows were found to import.');
        return;
      }

      const nextEntries = [...importedEntries, ...entries];
      persistEntries(nextEntries);
      window.alert(`Imported ${importedEntries.length} entr${importedEntries.length === 1 ? 'y' : 'ies'}.`);
    } catch {
      window.alert('Could not import this file. Please try again.');
    } finally {
      event.target.value = '';
    }
  };

  const onScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onScrollToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  return (
    <main className="page">
      <div className="container">
        <h1 className="title">Sneaker Portfolio</h1>

        <input
          className="input searchInput"
          placeholder="Search portfolio by shoe (brand, model), size, or year purchased"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        <p className="summary">
          {entries.length} pair{entries.length === 1 ? '' : 's'} • Total invested: ${totalInvested.toFixed(2)}
        </p>

        <div className="dataActionRow">
          <button className="exportButton" type="button" onClick={onExportEntries}>
            Export to Excel (.csv)
          </button>
          <button className="exportButton" type="button" onClick={onImportButtonClick}>
            Import from Excel (.csv)
          </button>
          <label className="selectAllControl">
            <input
              ref={selectAllEntriesRef}
              type="checkbox"
              className="entryCheckbox"
              checked={areAllEntriesSelected}
              onChange={onToggleAllEntriesSelected}
              disabled={entries.length === 0}
              aria-label="Select all entries"
            />
            Select All
          </label>
          <button
            className="deleteSelectedButton"
            type="button"
            onClick={onDeleteSelectedEntries}
            disabled={selectedCount === 0}
          >
            Delete Selected ({selectedCount})
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hiddenInput"
            onChange={onImportEntries}
          />
        </div>

        <section className="list">
          {filteredEntries.length === 0 ? (
            <p className="empty">No shoes yet. Add your first pair above.</p>
          ) : (
            filteredEntries.map((entry) => (
              <article className="card entry" key={entry.id}>
                <input
                  type="checkbox"
                  className="entryCheckbox"
                  checked={selectedEntryIds.includes(entry.id)}
                  onChange={() => onToggleEntrySelected(entry.id)}
                  aria-label={`Select ${entry.shoeName}`}
                />
                <img className="thumb" src={entry.imageUrl || FALLBACK_IMAGE} alt={entry.shoeName} />
                <div className="entryContent">
                  <h3 className="shoeName">{entry.shoeName}</h3>
                  <p className="meta">Size: {entry.size}</p>
                  <p className="meta">Date: {entry.purchaseDate}</p>
                  <p className="price">Paid: ${entry.purchasePrice.toFixed(2)}</p>
                  <button
                    type="button"
                    className="deleteButton"
                    onClick={() => onDeleteEntry(entry.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      <div className="floatingControlGroup" aria-label="Page controls">
        <button
          ref={floatingAddButtonRef}
          className="floatingAddButton"
          type="button"
          onClick={() => setIsEntryFormOpen((currentState) => !currentState)}
          aria-label="Open sneaker entry form"
        >
          +
        </button>

        <div className="sideNavButtons" aria-label="Page navigation controls">
          <button className="sideNavButton" type="button" onClick={onScrollToTop}>
            {'\u2191'}
          </button>
          <button className="sideNavButton" type="button" onClick={onScrollToBottom}>
            {'\u2193'}
          </button>
        </div>
      </div>

      {isEntryFormOpen ? (
        <div className="floatingOverlay" onMouseDown={onOverlayMouseDown}>
          <section
            ref={floatingFormPanelRef}
            className="floatingFormPanel card"
            aria-label="Add sneaker entry panel"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <div className="floatingFormHeader">
              <h2 className="floatingFormTitle">Add Sneaker</h2>
              <button
                type="button"
                className="floatingFormCloseButton"
                onClick={() => setIsEntryFormOpen(false)}
                aria-label="Close add sneaker panel"
              >
                x
              </button>
            </div>
            <form className="form" onSubmit={onSubmit}>
              <input
                className="input"
                placeholder="Shoe name (e.g. Jordan 1 Chicago)"
                value={shoeName}
                onChange={(event) => setShoeName(event.target.value)}
              />
              <select
                className="input"
                value={size}
                onChange={(event) => setSize(event.target.value)}
              >
                {sizeOptions.map((sizeOption) => (
                  <option key={sizeOption} value={sizeOption}>
                    {sizeOption}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="date"
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
          </section>
        </div>
      ) : null}
    </main>
  );
}
