import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type SneakerEntry = {
  id: string;
  shoeName: string;
  size: string;
  purchaseDate: string;
  purchasePrice: number;
  imageUrl: string;
};

type DeletedSneakerEntry = SneakerEntry & {
  deletedAt: string;
};

type ActiveTab = 'portfolio' | 'history';

type SortOption =
  | 'date-desc'
  | 'date-asc'
  | 'name-desc'
  | 'name-asc'
  | 'price-desc'
  | 'price-asc';

const STORAGE_KEY = 'sneaker-portfolio-entries-v1';
const HISTORY_STORAGE_KEY = 'sneaker-portfolio-history-v1';
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60';
const ISO_DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

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

const normalizeToIsoDate = (dateValue: string): string | null => {
  const trimmedValue = dateValue.trim();
  const dateMatch = ISO_DATE_PATTERN.exec(trimmedValue);
  if (!dateMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  const isValidDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;

  if (!isValidDate) {
    return null;
  }

  const normalizedMonth = String(month).padStart(2, '0');
  const normalizedDay = String(day).padStart(2, '0');
  return `${dateMatch[1]}-${normalizedMonth}-${normalizedDay}`;
};

export default function App() {
  const [shoeName, setShoeName] = useState('');
  const [size, setSize] = useState('10');
  const [purchaseDate, setPurchaseDate] = useState(getTodayDate());
  const [purchasePrice, setPurchasePrice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [isEntryFormOpen, setIsEntryFormOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<SneakerEntry[]>([]);
  const [deletedEntries, setDeletedEntries] = useState<DeletedSneakerEntry[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('portfolio');
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

      const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (rawHistory) {
        const parsedHistory = JSON.parse(rawHistory) as DeletedSneakerEntry[];
        setDeletedEntries(parsedHistory);
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
  const isEditingEntry = editingEntryId !== null;

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

  const filteredDeletedEntries = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return deletedEntries;
    }

    return deletedEntries.filter((entry) => {
      const searchableText = [entry.shoeName, entry.size, entry.purchaseDate, entry.deletedAt]
        .join(' ')
        .toLowerCase();
      return searchableText.includes(keyword);
    });
  }, [deletedEntries, searchTerm]);

  const sortedEntries = useMemo(() => {
    const entriesToSort = [...filteredEntries];

    entriesToSort.sort((firstEntry, secondEntry) => {
      if (sortOption === 'price-asc') {
        return firstEntry.purchasePrice - secondEntry.purchasePrice;
      }

      if (sortOption === 'price-desc') {
        return secondEntry.purchasePrice - firstEntry.purchasePrice;
      }

      if (sortOption === 'date-asc') {
        return firstEntry.purchaseDate.localeCompare(secondEntry.purchaseDate);
      }

      if (sortOption === 'date-desc') {
        return secondEntry.purchaseDate.localeCompare(firstEntry.purchaseDate);
      }

      if (sortOption === 'name-desc') {
        return secondEntry.shoeName.localeCompare(firstEntry.shoeName, undefined, {
          sensitivity: 'base',
        });
      }

      return firstEntry.shoeName.localeCompare(secondEntry.shoeName, undefined, {
        sensitivity: 'base',
      });
    });

    return entriesToSort;
  }, [filteredEntries, sortOption]);

  const visibleDeletedEntries = useMemo(() => {
    return [...filteredDeletedEntries].sort((firstEntry, secondEntry) =>
      secondEntry.deletedAt.localeCompare(firstEntry.deletedAt)
    );
  }, [filteredDeletedEntries]);

  const sizeOptions = useMemo(() => {
    const options: string[] = [];
    for (let value = 3; value <= 15; value += 0.5) {
      const label = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
      options.push(label);
    }
    return options;
  }, []);

  const resetEntryForm = () => {
    setShoeName('');
    setSize('10');
    setPurchaseDate(getTodayDate());
    setPurchasePrice('');
  };

  const openAddEntryForm = () => {
    setEditingEntryId(null);
    resetEntryForm();
    setIsEntryFormOpen(true);
  };

  const closeEntryForm = () => {
    setIsEntryFormOpen(false);
    setEditingEntryId(null);
  };

  const openPortfolioTab = () => {
    setActiveTab('portfolio');
  };

  const openHistoryTab = () => {
    setActiveTab('history');
    setSelectedEntryIds([]);
    closeEntryForm();
  };

  const formatDeletedAt = (deletedAt: string) => {
    const parsedDate = new Date(deletedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return 'Unknown';
    }

    return parsedDate.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const persistEntries = (nextEntries: SneakerEntry[]) => {
    setEntries(nextEntries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  };

  const persistDeletedEntries = (nextDeletedEntries: DeletedSneakerEntry[]) => {
    setDeletedEntries(nextDeletedEntries);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextDeletedEntries));
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
        setEditingEntryId(null);
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
      closeEntryForm();
    }
  };

  const onEditEntry = (entry: SneakerEntry) => {
    setEditingEntryId(entry.id);
    setShoeName(entry.shoeName);
    setSize(entry.size);
    setPurchaseDate(entry.purchaseDate);
    setPurchasePrice(entry.purchasePrice.toFixed(2));
    setIsEntryFormOpen(true);
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

    const normalizedPurchaseDate = normalizeToIsoDate(purchaseDate);
    if (!normalizedPurchaseDate) {
      window.alert('Purchase date must use yyyy-mm-dd format.');
      return;
    }

    const parsedPrice = Number(purchasePrice);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      window.alert('Purchase price must be a positive number.');
      return;
    }

    setIsSaving(true);
    try {
      const trimmedShoeName = shoeName.trim();
      const trimmedSize = size.trim();

      if (isEditingEntry && editingEntryId) {
        const existingEntry = entries.find((entry) => entry.id === editingEntryId);
        if (!existingEntry) {
          window.alert('The entry you are editing was not found. Please try again.');
          return;
        }

        const shouldRefreshImage =
          existingEntry.shoeName.trim().toLowerCase() !== trimmedShoeName.toLowerCase();
        const imageUrl = shouldRefreshImage
          ? await findSneakerImage(trimmedShoeName)
          : existingEntry.imageUrl || FALLBACK_IMAGE;

        const nextEntries = entries.map((entry) =>
          entry.id === editingEntryId
            ? {
                ...entry,
                shoeName: trimmedShoeName,
                size: trimmedSize,
                purchaseDate: normalizedPurchaseDate,
                purchasePrice: parsedPrice,
                imageUrl,
              }
            : entry
        );

        persistEntries(nextEntries);
      } else {
        const imageUrl = await findSneakerImage(trimmedShoeName);
        const newEntry: SneakerEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          shoeName: trimmedShoeName,
          size: trimmedSize,
          purchaseDate: normalizedPurchaseDate,
          purchasePrice: parsedPrice,
          imageUrl,
        };

        persistEntries([newEntry, ...entries]);
      }

      resetEntryForm();
      closeEntryForm();
    } finally {
      setIsSaving(false);
    }
  };

  const onDeleteEntry = (entryId: string) => {
    const shouldDelete = window.confirm('Move this entry to history?');
    if (!shouldDelete) {
      return;
    }

    const entryToDelete = entries.find((entry) => entry.id === entryId);
    if (!entryToDelete) {
      return;
    }

    const nextEntries = entries.filter((entry) => entry.id !== entryId);
    const nextDeletedEntries = [
      { ...entryToDelete, deletedAt: new Date().toISOString() },
      ...deletedEntries,
    ];
    persistEntries(nextEntries);
    persistDeletedEntries(nextDeletedEntries);
  };

  const onPermanentlyDeleteEntry = (entryId: string) => {
    const shouldDelete = window.confirm(
      'Permanently delete this entry from history? This cannot be undone.'
    );
    if (!shouldDelete) {
      return;
    }

    const nextDeletedEntries = deletedEntries.filter((entry) => entry.id !== entryId);
    persistDeletedEntries(nextDeletedEntries);
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
      ? 'Move all entries to history?'
      : `Move ${selectedEntryIds.length} selected entr${selectedEntryIds.length === 1 ? 'y' : 'ies'} to history?`;

    const shouldDelete = window.confirm(confirmationMessage);
    if (!shouldDelete) {
      return;
    }

    const selectedIdSet = new Set(selectedEntryIds);
    const deletedAt = new Date().toISOString();
    const entriesToDelete = entries
      .filter((entry) => selectedIdSet.has(entry.id))
      .map((entry) => ({ ...entry, deletedAt }));
    const nextEntries = entries.filter((entry) => !selectedIdSet.has(entry.id));
    const nextDeletedEntries = [...entriesToDelete, ...deletedEntries];
    persistEntries(nextEntries);
    persistDeletedEntries(nextDeletedEntries);
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
        const normalizedPurchaseDate = normalizeToIsoDate(dateValue);
        const parsedPrice = Number(priceValue);

        if (!shoe || !sizeValue || !normalizedPurchaseDate || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          continue;
        }

        importedEntries.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          shoeName: shoe,
          size: sizeValue,
          purchaseDate: normalizedPurchaseDate,
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

        <div className="tabRow" role="tablist" aria-label="Sneaker portfolio views">
          <button
            className={`tabButton ${activeTab === 'portfolio' ? 'tabButtonActive' : ''}`}
            type="button"
            onClick={openPortfolioTab}
            role="tab"
            aria-selected={activeTab === 'portfolio'}
          >
            Portfolio ({entries.length})
          </button>
          <button
            className={`tabButton ${activeTab === 'history' ? 'tabButtonActive' : ''}`}
            type="button"
            onClick={openHistoryTab}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            History ({deletedEntries.length})
          </button>
        </div>

        <input
          className="input searchInput"
          placeholder={
            activeTab === 'portfolio'
              ? 'Search portfolio by shoe (brand, model), size, or year purchased'
              : 'Search history by shoe, size, purchase date, or deletion date'
          }
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />

        <p className="summary">
          {activeTab === 'portfolio'
            ? `${entries.length} pair${entries.length === 1 ? '' : 's'} • Total invested: $${totalInvested.toFixed(2)}`
            : `${deletedEntries.length} deleted pair${deletedEntries.length === 1 ? '' : 's'}`}
        </p>

        {activeTab === 'portfolio' ? (
          <div className="dataActionRow">
            <button className="exportButton" type="button" onClick={onExportEntries}>
              Export to Excel (.csv)
            </button>
            <button className="exportButton" type="button" onClick={onImportButtonClick}>
              Import from Excel (.csv)
            </button>
            <select
              className="sortFieldSelect"
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as SortOption)}
              aria-label="Sort entries by"
            >
              <option value="date-desc">Sort: Date New-Old</option>
              <option value="date-asc">Sort: Date Old-New</option>
              <option value="name-asc">Sort: Name A-Z</option>
              <option value="name-desc">Sort: Name Z-A</option>
              <option value="price-desc">Sort: Price High-Low</option>
              <option value="price-asc">Sort: Price Low-High</option>
            </select>
            <div className="bulkActionRow">
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
            </div>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hiddenInput"
              onChange={onImportEntries}
            />
          </div>
        ) : null}

        <section className="list">
          {activeTab === 'portfolio' ? (
            sortedEntries.length === 0 ? (
              <p className="empty">
                {entries.length === 0
                  ? 'No shoes yet. Use the + button to add your first pair.'
                  : 'No portfolio entries match your search.'}
              </p>
            ) : (
              sortedEntries.map((entry) => (
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
                    <div className="entryActionRow">
                      <button
                        type="button"
                        className="editButton"
                        onClick={() => onEditEntry(entry)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="deleteButton"
                        onClick={() => onDeleteEntry(entry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )
          ) : visibleDeletedEntries.length === 0 ? (
            <p className="empty">
              {deletedEntries.length === 0
                ? 'History is empty. Deleted entries will appear here.'
                : 'No history entries match your search.'}
            </p>
          ) : (
            visibleDeletedEntries.map((entry) => (
              <article className="card entry historyEntry" key={entry.id}>
                <img className="thumb" src={entry.imageUrl || FALLBACK_IMAGE} alt={entry.shoeName} />
                <div className="entryContent">
                  <h3 className="shoeName">{entry.shoeName}</h3>
                  <p className="meta">Size: {entry.size}</p>
                  <p className="meta">Date: {entry.purchaseDate}</p>
                  <p className="meta">Deleted: {formatDeletedAt(entry.deletedAt)}</p>
                  <p className="price">Paid: ${entry.purchasePrice.toFixed(2)}</p>
                  <div className="entryActionRow">
                    <button
                      type="button"
                      className="deleteButton"
                      onClick={() => onPermanentlyDeleteEntry(entry.id)}
                    >
                      Delete Permanently
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      <div className="floatingControlGroup" aria-label="Page controls">
        {activeTab === 'portfolio' ? (
          <button
            ref={floatingAddButtonRef}
            className="floatingAddButton"
            type="button"
            onClick={() => {
              if (isEntryFormOpen) {
                closeEntryForm();
                return;
              }

              openAddEntryForm();
            }}
            aria-label="Open sneaker entry form"
          >
            +
          </button>
        ) : null}

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
              <h2 className="floatingFormTitle">{isEditingEntry ? 'Edit Sneaker' : 'Add Sneaker'}</h2>
              <button
                type="button"
                className="floatingFormCloseButton"
                onClick={closeEntryForm}
                aria-label="Close sneaker form panel"
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
                {isSaving ? 'Saving...' : isEditingEntry ? 'Save Changes' : 'Add to Portfolio'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
