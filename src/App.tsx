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

// Expands a date into extra tokens (full/short month + year) so text search can match month names.
const formatDateSearchTokens = (dateValue: string): string => {
  const normalized = ISO_DATE_PATTERN.test(dateValue) ? `${dateValue}T00:00:00` : dateValue;
  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const longMonth = parsedDate.toLocaleString('en-US', { month: 'long' });
  const shortMonth = parsedDate.toLocaleString('en-US', { month: 'short' });
  return `${longMonth} ${shortMonth} ${parsedDate.getFullYear()}`;
};

// ---- Dependency-free .xlsx (OOXML) read/write helpers ----

const escapeXmlValue = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const xlsxColumnLetter = (columnIndex: number): string => {
  let letter = '';
  let remaining = columnIndex;
  while (remaining >= 0) {
    letter = String.fromCharCode((remaining % 26) + 65) + letter;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return letter;
};

const buildWorksheetXml = (rows: (string | number)[][]): string => {
  const rowsXml = rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellsXml = cells
        .map((value, columnIndex) => {
          const reference = `${xlsxColumnLetter(columnIndex)}${rowNumber}`;
          if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${reference}"><v>${value}</v></c>`;
          }
          return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlValue(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}">${cellsXml}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowsXml}</sheetData></worksheet>`
  );
};

const XLSX_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const xlsxCrc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = XLSX_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

type ZipEntry = { name: string; data: Uint8Array };

// Packs entries into an uncompressed (STORED) ZIP, a valid and portable .xlsx container.
const zipStore = (entries: ZipEntry[]): Uint8Array => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = xlsxCrc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  const totalSize = centralOffset + centralSize + endRecord.length;
  const output = new Uint8Array(totalSize);
  let position = 0;
  for (const part of [...localParts, ...centralParts, endRecord]) {
    output.set(part, position);
    position += part.length;
  }
  return output;
};

const buildXlsx = (sheets: { name: string; rows: (string | number)[][] }[]): Uint8Array => {
  const encoder = new TextEncoder();

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('') +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets
      .map((sheet, index) => `<sheet name="${escapeXmlValue(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join('') +
    '</sheets></workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      )
      .join('') +
    '</Relationships>';

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encoder.encode(buildWorksheetXml(sheet.rows)),
    })),
  ];

  return zipStore(entries);
};

const inflateRawDeflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const streamGlobal = globalThis as unknown as {
    DecompressionStream?: new (format: string) => unknown;
  };
  if (!streamGlobal.DecompressionStream) {
    throw new Error('This browser cannot read compressed Excel files.');
  }
  const decompressor = new streamGlobal.DecompressionStream('deflate-raw');
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(decompressor as any);
  const buffer = await new Response(stream as any).arrayBuffer();
  return new Uint8Array(buffer);
};

const parseZipEntries = (bytes: Uint8Array): Map<string, { method: number; data: Uint8Array }> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error('Not a valid Excel file.');
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const files = new Map<string, { method: number; data: Uint8Array }>();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      break;
    }
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    files.set(name, { method, data: bytes.subarray(dataStart, dataStart + compressedSize) });

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
};

const readZipEntryText = async (
  files: Map<string, { method: number; data: Uint8Array }>,
  name: string
): Promise<string | null> => {
  const entry = files.get(name);
  if (!entry) {
    return null;
  }
  const bytes = entry.method === 0 ? entry.data : await inflateRawDeflate(entry.data);
  return new TextDecoder('utf-8').decode(bytes);
};

const referenceToColumnIndex = (reference: string): number => {
  const match = /^([A-Za-z]+)\d+$/.exec(reference);
  if (!match) {
    return -1;
  }
  const letters = match[1].toUpperCase();
  let index = 0;
  for (let position = 0; position < letters.length; position += 1) {
    index = index * 26 + (letters.charCodeAt(position) - 64);
  }
  return index - 1;
};

const parseSheetRows = (sheetXml: string, sharedStrings: string[]): string[][] => {
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
  const rows = Array.from(doc.getElementsByTagName('row'));

  return rows.map((row) => {
    const rowValues: string[] = [];
    const cells = Array.from(row.getElementsByTagName('c'));

    cells.forEach((cell, cellIndex) => {
      const cellType = cell.getAttribute('t');
      let cellText = '';

      if (cellType === 'inlineStr') {
        cellText = Array.from(cell.getElementsByTagName('t'))
          .map((node) => node.textContent ?? '')
          .join('');
      } else if (cellType === 's') {
        const valueNode = cell.getElementsByTagName('v')[0];
        const sharedIndex = valueNode ? Number(valueNode.textContent) : Number.NaN;
        cellText =
          Number.isInteger(sharedIndex) && sharedIndex >= 0 && sharedIndex < sharedStrings.length
            ? sharedStrings[sharedIndex]
            : '';
      } else {
        const valueNode = cell.getElementsByTagName('v')[0];
        cellText = valueNode?.textContent ?? '';
      }

      const columnIndex = referenceToColumnIndex(cell.getAttribute('r') ?? '');
      const targetIndex = columnIndex >= 0 ? columnIndex : cellIndex;
      rowValues[targetIndex] = cellText.trim();
    });

    for (let index = 0; index < rowValues.length; index += 1) {
      if (rowValues[index] === undefined) {
        rowValues[index] = '';
      }
    }

    return rowValues;
  });
};

const parseXlsxWorkbook = async (bytes: Uint8Array): Promise<Map<string, string[][]>> => {
  const files = parseZipEntries(bytes);
  const workbookXml = await readZipEntryText(files, 'xl/workbook.xml');
  const workbookRelsXml = await readZipEntryText(files, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !workbookRelsXml) {
    throw new Error('Not a valid Excel file.');
  }

  const parser = new DOMParser();
  const workbookDoc = parser.parseFromString(workbookXml, 'application/xml');
  const relsDoc = parser.parseFromString(workbookRelsXml, 'application/xml');

  const relationshipTargets = new Map<string, string>();
  Array.from(relsDoc.getElementsByTagName('Relationship')).forEach((relationship) => {
    const id = relationship.getAttribute('Id');
    const target = relationship.getAttribute('Target');
    if (id && target) {
      relationshipTargets.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
  });

  const sharedStrings: string[] = [];
  const sharedStringsXml = await readZipEntryText(files, 'xl/sharedStrings.xml');
  if (sharedStringsXml) {
    const sharedDoc = parser.parseFromString(sharedStringsXml, 'application/xml');
    Array.from(sharedDoc.getElementsByTagName('si')).forEach((si) => {
      const text = Array.from(si.getElementsByTagName('t'))
        .map((node) => node.textContent ?? '')
        .join('');
      sharedStrings.push(text);
    });
  }

  const sheets = new Map<string, string[][]>();
  const sheetElements = Array.from(workbookDoc.getElementsByTagName('sheet'));

  for (const sheetElement of sheetElements) {
    const sheetName = sheetElement.getAttribute('name') ?? '';
    const relationshipId =
      sheetElement.getAttribute('r:id') ||
      sheetElement.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
      '';
    const target = relationshipTargets.get(relationshipId);
    if (!target) {
      continue;
    }
    const sheetXml = await readZipEntryText(files, `xl/${target}`);
    if (!sheetXml) {
      continue;
    }
    sheets.set(sheetName, parseSheetRows(sheetXml, sharedStrings));
  }

  return sheets;
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
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('portfolio');
  const [isSaving, setIsSaving] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const floatingFormPanelRef = useRef<HTMLElement | null>(null);
  const floatingAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectAllEntriesRef = useRef<HTMLInputElement | null>(null);
  const selectAllHistoryRef = useRef<HTMLInputElement | null>(null);

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

  const averagePurchasePrice = entries.length > 0 ? totalInvested / entries.length : 0;

  const selectedCount = selectedEntryIds.length;
  const areAllEntriesSelected = entries.length > 0 && selectedCount === entries.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < entries.length;
  const selectedHistoryCount = selectedHistoryIds.length;
  const areAllHistorySelected =
    deletedEntries.length > 0 && selectedHistoryCount === deletedEntries.length;
  const isHistoryPartiallySelected =
    selectedHistoryCount > 0 && selectedHistoryCount < deletedEntries.length;
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
      const searchableText = [
        entry.shoeName,
        entry.size,
        entry.purchaseDate,
        formatDateSearchTokens(entry.purchaseDate),
        entry.deletedAt,
        formatDateSearchTokens(entry.deletedAt),
      ]
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

  const deletedPortfolioValue = useMemo(
    () => deletedEntries.reduce((sum, entry) => sum + entry.purchasePrice, 0),
    [deletedEntries]
  );

  const latestDeletedEntry = visibleDeletedEntries[0];

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
    setSelectedHistoryIds([]);
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
    setSelectedHistoryIds((previousSelectedIds) => {
      const validEntryIds = new Set(deletedEntries.map((entry) => entry.id));
      return previousSelectedIds.filter((entryId) => validEntryIds.has(entryId));
    });
  }, [deletedEntries]);

  useEffect(() => {
    if (!selectAllEntriesRef.current) {
      return;
    }

    selectAllEntriesRef.current.indeterminate = isPartiallySelected;
  }, [isPartiallySelected]);

  useEffect(() => {
    if (!selectAllHistoryRef.current) {
      return;
    }

    selectAllHistoryRef.current.indeterminate = isHistoryPartiallySelected;
  }, [isHistoryPartiallySelected]);

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

  const onToggleHistorySelected = (entryId: string) => {
    setSelectedHistoryIds((previousSelectedIds) => {
      if (previousSelectedIds.includes(entryId)) {
        return previousSelectedIds.filter((id) => id !== entryId);
      }
      return [...previousSelectedIds, entryId];
    });
  };

  const onDeleteSelectedHistoryEntries = () => {
    if (selectedHistoryIds.length === 0) {
      return;
    }

    const confirmationMessage = areAllHistorySelected
      ? 'Permanently delete all history entries? This cannot be undone.'
      : `Permanently delete ${selectedHistoryIds.length} selected entr${selectedHistoryIds.length === 1 ? 'y' : 'ies'} from history? This cannot be undone.`;

    const shouldDelete = window.confirm(confirmationMessage);
    if (!shouldDelete) {
      return;
    }

    const selectedIdSet = new Set(selectedHistoryIds);
    const nextDeletedEntries = deletedEntries.filter((entry) => !selectedIdSet.has(entry.id));
    persistDeletedEntries(nextDeletedEntries);
    setSelectedHistoryIds([]);
  };

  const onToggleAllHistorySelected = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedHistoryIds(deletedEntries.map((entry) => entry.id));
      return;
    }

    setSelectedHistoryIds([]);
  };

  const onExportEntries = () => {
    if (entries.length === 0 && deletedEntries.length === 0) {
      window.alert('No entries to export yet.');
      return;
    }

    const portfolioRows: (string | number)[][] = [
      ['Shoe Name', 'Size', 'Purchase Date', 'Purchase Price', 'Image URL'],
      ...entries.map((entry) => [
        entry.shoeName,
        entry.size,
        entry.purchaseDate,
        Number(entry.purchasePrice.toFixed(2)),
        entry.imageUrl,
      ]),
    ];

    const historyRows: (string | number)[][] = [
      ['Shoe Name', 'Size', 'Purchase Date', 'Purchase Price', 'Deleted At', 'Image URL'],
      ...deletedEntries.map((entry) => [
        entry.shoeName,
        entry.size,
        entry.purchaseDate,
        Number(entry.purchasePrice.toFixed(2)),
        formatDeletedAt(entry.deletedAt),
        entry.imageUrl,
      ]),
    ];

    const workbook = buildXlsx([
      { name: 'Portfolio', rows: portfolioRows },
      { name: 'History', rows: historyRows },
    ]);

    const blob = new Blob([workbook as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateLabel = getTodayDate();
    anchor.href = url;
    anchor.download = `sneaker-portfolio-${dateLabel}.xlsx`;
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

  const makeEntryFromFields = (
    shoe: string,
    sizeValue: string,
    dateValue: string,
    priceValue: string,
    imageValue: string
  ): SneakerEntry | null => {
    const normalizedPurchaseDate = normalizeToIsoDate(dateValue);
    const parsedPrice = Number(priceValue);

    if (!shoe || !sizeValue || !normalizedPurchaseDate || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return null;
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      shoeName: shoe,
      size: sizeValue,
      purchaseDate: normalizedPurchaseDate,
      purchasePrice: parsedPrice,
      imageUrl: imageValue || FALLBACK_IMAGE,
    };
  };

  // Reads a SpreadsheetML 2003 workbook into a map of sheet name -> rows of cell text.
  const parseExcelWorkbook = (xmlText: string): Map<string, string[][]> => {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Malformed workbook');
    }

    const sheets = new Map<string, string[][]>();
    const worksheets = Array.from(doc.getElementsByTagName('Worksheet'));

    for (const worksheet of worksheets) {
      const name = worksheet.getAttribute('ss:Name') ?? '';
      const table = worksheet.getElementsByTagName('Table')[0];
      const rows = table ? Array.from(table.getElementsByTagName('Row')) : [];

      const parsedRows = rows.map((row) =>
        Array.from(row.getElementsByTagName('Cell')).map((cell) => {
          const data = cell.getElementsByTagName('Data')[0];
          return data?.textContent?.trim() ?? '';
        })
      );

      sheets.set(name, parsedRows);
    }

    return sheets;
  };

  const applyImportedSheets = (sheets: Map<string, string[][]>) => {
    const portfolioRows = sheets.get('Portfolio') ?? [];
    const historyRows = sheets.get('History') ?? [];

    const importedEntries: SneakerEntry[] = [];
    for (const row of portfolioRows.slice(1)) {
      const [shoe, sizeValue, dateValue, priceValue, imageValue] = row;
      const entry = makeEntryFromFields(shoe, sizeValue, dateValue, priceValue, imageValue);
      if (entry) {
        importedEntries.push(entry);
      }
    }

    const importedDeletedEntries: DeletedSneakerEntry[] = [];
    for (const row of historyRows.slice(1)) {
      const [shoe, sizeValue, dateValue, priceValue, deletedAtValue, imageValue] = row;
      const entry = makeEntryFromFields(shoe, sizeValue, dateValue, priceValue, imageValue);
      if (entry) {
        const parsedDeletedAt = new Date(deletedAtValue);
        const deletedAt = Number.isNaN(parsedDeletedAt.getTime())
          ? new Date().toISOString()
          : parsedDeletedAt.toISOString();
        importedDeletedEntries.push({ ...entry, deletedAt });
      }
    }

    if (importedEntries.length === 0 && importedDeletedEntries.length === 0) {
      window.alert('No valid rows were found to import.');
      return;
    }

    if (importedEntries.length > 0) {
      persistEntries([...importedEntries, ...entries]);
    }
    if (importedDeletedEntries.length > 0) {
      persistDeletedEntries([...importedDeletedEntries, ...deletedEntries]);
    }

    const importedParts: string[] = [];
    if (importedEntries.length > 0) {
      importedParts.push(`${importedEntries.length} portfolio entr${importedEntries.length === 1 ? 'y' : 'ies'}`);
    }
    if (importedDeletedEntries.length > 0) {
      importedParts.push(`${importedDeletedEntries.length} history entr${importedDeletedEntries.length === 1 ? 'y' : 'ies'}`);
    }
    window.alert(`Imported ${importedParts.join(' and ')}.`);
  };

  const importExcelWorkbook = (xmlText: string) => {
    applyImportedSheets(parseExcelWorkbook(xmlText));
  };

  const importXlsxWorkbook = async (bytes: Uint8Array) => {
    applyImportedSheets(await parseXlsxWorkbook(bytes));
  };

  const importCsvEntries = (rawText: string) => {
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
      const entry = makeEntryFromFields(shoe, sizeValue, dateValue, priceValue, imageValue);
      if (entry) {
        importedEntries.push(entry);
      }
    }

    if (importedEntries.length === 0) {
      window.alert('No valid rows were found to import.');
      return;
    }

    persistEntries([...importedEntries, ...entries]);
    window.alert(`Imported ${importedEntries.length} entr${importedEntries.length === 1 ? 'y' : 'ies'}.`);
  };

  const onImportEntries = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const isZipFile = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;

      if (isZipFile) {
        await importXlsxWorkbook(buffer);
      } else {
        const rawText = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
        const normalizedStart = rawText.trimStart();
        const isExcelXml =
          normalizedStart.startsWith('<?xml') ||
          normalizedStart.startsWith('<Workbook') ||
          normalizedStart.includes('urn:schemas-microsoft-com:office:spreadsheet');

        if (isExcelXml) {
          importExcelWorkbook(rawText);
        } else {
          importCsvEntries(rawText);
        }
      }
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
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Collection Dashboard</p>
            <h1 className="title">Sneaker Portfolio</h1>
          </div>
        </header>

        <section className="statsGrid" aria-label="Sneaker portfolio summary">
          <article className="statCard">
            <span className="statLabel">Total Pairs</span>
            <strong className="statValue">{entries.length}</strong>
            <span className="statHint">Active collection</span>
          </article>
          <article className="statCard statCardAccent">
            <span className="statLabel">Invested</span>
            <strong className="statValue">${totalInvested.toFixed(2)}</strong>
            <span className="statHint">Current portfolio</span>
          </article>
          <article className="statCard">
            <span className="statLabel">Average Pair</span>
            <strong className="statValue">${averagePurchasePrice.toFixed(2)}</strong>
            <span className="statHint">Purchase price</span>
          </article>
          <article className="statCard">
            <span className="statLabel">History</span>
            <strong className="statValue">{deletedEntries.length}</strong>
            <span className="statHint">${deletedPortfolioValue.toFixed(2)} archived</span>
          </article>
        </section>

        <div className="tabRow" role="tablist" aria-label="Sneaker portfolio views">
          <button
            className={`tabButton ${activeTab === 'portfolio' ? 'tabButtonActive' : ''}`}
            type="button"
            onClick={openPortfolioTab}
            role="tab"
            aria-selected={activeTab === 'portfolio'}
          >
            Portfolio
            <span className="tabCount">{entries.length}</span>
          </button>
          <button
            className={`tabButton ${activeTab === 'history' ? 'tabButtonActive' : ''}`}
            type="button"
            onClick={openHistoryTab}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            History
            <span className="tabCount">{deletedEntries.length}</span>
          </button>
        </div>

        <section className="toolbar" aria-label="Portfolio controls">
          <div className="searchGroup">
            <label className="fieldLabel" htmlFor="entry-search">
              Search
            </label>
            <input
              id="entry-search"
              className="input searchInput"
              placeholder={activeTab === 'portfolio' ? 'Shoe, size, or purchase year' : 'Shoe, size, or deletion date'}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          {activeTab === 'portfolio' ? (
            <div className="toolbarActions">
              <button className="secondaryButton" type="button" onClick={onExportEntries}>
                Export to Excel
              </button>
              <button className="secondaryButton" type="button" onClick={onImportButtonClick}>
                Import from Excel
              </button>
              <select
                className="sortFieldSelect"
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                aria-label="Sort entries by"
              >
                <option value="date-desc">Date New-Old</option>
                <option value="date-asc">Date Old-New</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="price-desc">Price High-Low</option>
                <option value="price-asc">Price Low-High</option>
              </select>
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
          ) : (
            <div className="historyControls">
              <div className="toolbarActions">
                <label className="selectAllControl">
                  <input
                    ref={selectAllHistoryRef}
                    type="checkbox"
                    className="entryCheckbox"
                    checked={areAllHistorySelected}
                    onChange={onToggleAllHistorySelected}
                    disabled={deletedEntries.length === 0}
                    aria-label="Select all history entries"
                  />
                  Select All
                </label>
                <button
                  className="deleteSelectedButton"
                  type="button"
                  onClick={onDeleteSelectedHistoryEntries}
                  disabled={selectedHistoryCount === 0}
                >
                  Delete Selected ({selectedHistoryCount})
                </button>
              </div>
              <p className="historySummary">
                Last deleted: {latestDeletedEntry ? formatDeletedAt(latestDeletedEntry.deletedAt) : 'None'}
              </p>
            </div>
          )}

          <input
            ref={importFileInputRef}
            type="file"
            accept=".csv,.xls,.xlsx,.xml,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hiddenInput"
            onChange={onImportEntries}
          />
        </section>

        <section className="list">
          {activeTab === 'portfolio' ? (
            sortedEntries.length === 0 ? (
              <div className="emptyState">
                <h2>{entries.length === 0 ? 'No Shoes Yet' : 'No Matches'}</h2>
                <p>{entries.length === 0 ? 'Add your first pair to start the collection.' : 'Try a different search.'}</p>
                {entries.length === 0 ? (
                  <button className="button emptyActionButton" type="button" onClick={openAddEntryForm}>
                    Add Sneaker
                  </button>
                ) : null}
              </div>
            ) : (
              sortedEntries.map((entry) => (
                <article className="card entry sneakerCard" key={entry.id}>
                  <div className="cardMedia">
                    <input
                      type="checkbox"
                      className="entryCheckbox cardCheckbox"
                      checked={selectedEntryIds.includes(entry.id)}
                      onChange={() => onToggleEntrySelected(entry.id)}
                      aria-label={`Select ${entry.shoeName}`}
                    />
                    <img className="thumb" src={entry.imageUrl || FALLBACK_IMAGE} alt={entry.shoeName} />
                  </div>
                  <div className="entryContent">
                    <div className="entryHeader">
                      <h3 className="shoeName">{entry.shoeName}</h3>
                      <p className="price">${entry.purchasePrice.toFixed(2)}</p>
                    </div>
                    <dl className="entryMetaGrid">
                      <div>
                        <dt>Size</dt>
                        <dd>{entry.size}</dd>
                      </div>
                      <div>
                        <dt>Purchased</dt>
                        <dd>{entry.purchaseDate}</dd>
                      </div>
                    </dl>
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
            <div className="emptyState">
              <h2>{deletedEntries.length === 0 ? 'History Is Empty' : 'No Matches'}</h2>
              <p>{deletedEntries.length === 0 ? 'Deleted entries will land here.' : 'Try a different search.'}</p>
            </div>
          ) : (
            visibleDeletedEntries.map((entry) => (
              <article className="card entry sneakerCard historyEntry" key={entry.id}>
                <div className="cardMedia">
                  <input
                    type="checkbox"
                    className="entryCheckbox cardCheckbox"
                    checked={selectedHistoryIds.includes(entry.id)}
                    onChange={() => onToggleHistorySelected(entry.id)}
                    aria-label={`Select ${entry.shoeName}`}
                  />
                  <img className="thumb" src={entry.imageUrl || FALLBACK_IMAGE} alt={entry.shoeName} />
                </div>
                <div className="entryContent">
                  <div className="entryHeader">
                    <h3 className="shoeName">{entry.shoeName}</h3>
                    <p className="price">${entry.purchasePrice.toFixed(2)}</p>
                  </div>
                  <dl className="entryMetaGrid">
                    <div>
                      <dt>Size</dt>
                      <dd>{entry.size}</dd>
                    </div>
                    <div>
                      <dt>Purchased</dt>
                      <dd>{entry.purchaseDate}</dd>
                    </div>
                    <div className="wideMetaItem">
                      <dt>Deleted</dt>
                      <dd>{formatDeletedAt(entry.deletedAt)}</dd>
                    </div>
                  </dl>
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
