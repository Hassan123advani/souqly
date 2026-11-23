import { describe, expect, it } from 'vitest';
import { csvRow } from './csv';
import { CsvParseError, parseCsv, parseCsvRecords, unguardCell } from './csvParse';

describe('parseCsv', () => {
  it('parses simple rows with LF, CRLF and CR endings and no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2\r')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles quoted commas, doubled quotes and embedded newlines', () => {
    const rows = parseCsv('title,desc\n"Lawn, 3pc","He said ""hi""\nline two"\n');
    expect(rows).toEqual([['title', 'desc'], ['Lawn, 3pc', 'He said "hi"\nline two']]);
  });

  it('keeps empty fields and empty quoted fields', () => {
    expect(parseCsv('a,,c\n"",x,')).toEqual([['a', '', 'c'], ['', 'x', '']]);
  });

  it('strips a UTF-8 BOM and keeps Urdu text', () => {
    expect(parseCsv('﻿name\nلان سوٹ')).toEqual([['name'], ['لان سوٹ']]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
  });

  it('keeps a stray quote inside an unquoted field literally', () => {
    expect(parseCsv('5" screen,x')).toEqual([['5" screen', 'x']]);
  });

  it('throws on an unterminated quote with the line number', () => {
    expect(() => parseCsv('a\n"open,b\nc')).toThrow(CsvParseError);
    try {
      parseCsv('a\n"open');
    } catch (e) {
      expect((e as CsvParseError).line).toBe(2);
    }
  });

  it('enforces row and field limits', () => {
    expect(() => parseCsv('1\n2\n3', { maxRows: 2 })).toThrow(/Too many rows/);
    expect(() => parseCsv(`"${'x'.repeat(50)}"`, { maxFieldLength: 10 })).toThrow(/Field too long/);
  });

  it('round-trips what lib/csv writes (including injection-guarded cells)', () => {
    const values = ['=SUM(A1)', 'plain', 'with, comma', 'quote "q"', 'multi\nline', '-5', '@x'];
    const [row] = parseCsv(csvRow(values));
    expect(row![0]).toBe("'=SUM(A1)");
    expect(row!.map(unguardCell)).toEqual(values);
  });
});

describe('parseCsvRecords', () => {
  it('maps lower-cased trimmed headers to trimmed values and pads short rows', () => {
    const { headers, records } = parseCsvRecords(' SKU ,Price\nA1, 100 \nB2');
    expect(headers).toEqual(['sku', 'price']);
    expect(records).toEqual([{ sku: 'A1', price: '100' }, { sku: 'B2', price: '' }]);
  });
  it('counts the row limit without the header', () => {
    expect(parseCsvRecords('h\n1\n2', { maxRows: 2 }).records).toHaveLength(2);
    expect(() => parseCsvRecords('h\n1\n2\n3', { maxRows: 2 })).toThrow(/Too many rows/);
  });
});
