import type { Response } from 'express';

/**
 * One CSV cell. Formula injection: cells starting with = + - @ (or tab / CR) get a leading `'` so
 * spreadsheet apps treat them as text. Quotes are doubled and the cell is quoted when needed.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

/**
 * Streams rows from an async iterable (e.g. a Mongoose cursor) as a CSV download. Never buffers the
 * whole export in memory. A UTF-8 BOM is written so Excel opens Urdu/Arabic text correctly.
 */
export async function streamCsv<T>(res: Response, filename: string, columns: CsvColumn<T>[], rows: AsyncIterable<T>): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, '_')}"`);
  res.write('﻿');
  res.write(csvRow(columns.map((c) => c.header)));
  for await (const row of rows) {
    if (!res.write(csvRow(columns.map((c) => c.value(row))))) await new Promise((r) => res.once('drain', r));
  }
  res.end();
}
