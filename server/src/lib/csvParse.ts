/**
 * Small RFC 4180 CSV parser (no dependencies). Handles quoted fields with commas, doubled quotes
 * and embedded CR/LF newlines, CRLF / LF / CR row endings, a leading UTF-8 BOM and a missing final
 * newline. Blank lines are skipped. Throws CsvParseError on an unterminated quote or when a limit is hit.
 */
export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export function parseCsv(input: string, opts: { maxRows?: number; maxFieldLength?: number } = {}): string[][] {
  const maxRows = opts.maxRows ?? Infinity;
  const maxField = opts.maxFieldLength ?? 20_000;
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quotedField = false;
  let line = 1;
  let rowStartLine = 1;

  const pushField = () => {
    if (field.length > maxField) throw new CsvParseError(`Field too long (max ${maxField} characters)`, rowStartLine);
    row.push(field);
    field = '';
    quotedField = false;
  };
  const pushRow = () => {
    pushField();
    // Skip blank lines (a single empty unquoted field).
    if (!(row.length === 1 && row[0] === '')) {
      if (rows.length >= maxRows) throw new CsvParseError(`Too many rows (max ${maxRows})`, rowStartLine);
      rows.push(row);
    }
    row = [];
    rowStartLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (field === '' && !quotedField) {
        inQuotes = true;
        quotedField = true;
      } else field += c; // stray quote inside an unquoted field: keep it literally
    } else if (c === ',') pushField();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      line++;
      pushRow();
    } else field += c;
  }
  if (inQuotes) throw new CsvParseError('Unterminated quoted field', rowStartLine);
  if (field !== '' || row.length > 0 || quotedField) pushRow();
  return rows;
}

/** Parses with a header row → array of records keyed by the (trimmed, lower-cased) header names. */
export function parseCsvRecords(input: string, opts: { maxRows?: number } = {}): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(input, { ...(opts.maxRows !== undefined ? { maxRows: opts.maxRows + 1 } : {}) });
  const [head, ...body] = rows;
  if (!head) return { headers: [], records: [] };
  const headers = head.map((h) => h.trim().toLowerCase());
  return {
    headers,
    records: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

/** Undo the export's CSV-injection guard (a leading `'` before = + - @) so round-trips are lossless. */
export function unguardCell(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}
