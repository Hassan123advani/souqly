import { Types } from 'mongoose';
import { AppError } from './AppError';

/**
 * Cursor pagination over (sortField, _id). The cursor is base64url JSON `{ v, id, d? }`
 * where `v` is the sort value of the last item, `id` its _id and `d` marks a Date value.
 */
type CursorPayload = { v: unknown; id: string; d?: 1 };

export function encodeCursor(value: unknown, id: Types.ObjectId | string): string {
  const payload: CursorPayload =
    value instanceof Date ? { v: value.toISOString(), id: String(id), d: 1 } : { v: value, id: String(id) };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): { v: unknown; id: Types.ObjectId } {
  try {
    const p = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    if (!p || typeof p !== 'object' || !Types.ObjectId.isValid(p.id)) throw new Error('bad cursor');
    const v = p.d ? new Date(String(p.v)) : p.v;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) throw new Error('bad cursor');
    return { v, id: new Types.ObjectId(p.id) };
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor');
  }
}

/** Mongo filter that selects items strictly after the cursor for the given sort direction. */
export function cursorFilter(field: string, direction: 1 | -1, cursor?: string): Record<string, unknown> {
  if (!cursor) return {};
  const { v, id } = decodeCursor(cursor);
  const op = direction === -1 ? '$lt' : '$gt';
  if (field === '_id') return { _id: { [op]: id } };
  return { $or: [{ [field]: { [op]: v } }, { [field]: v, _id: { [op]: id } }] };
}

export function cursorSort(field: string, direction: 1 | -1): Record<string, 1 | -1> {
  return field === '_id' ? { _id: direction } : { [field]: direction, _id: direction };
}

/** Query with limit+1 items, then pass them here to trim and compute `nextCursor`. */
export function paginate<T extends { _id: Types.ObjectId }>(
  items: T[],
  limit: number,
  field: string,
): { items: T[]; nextCursor: string | null } {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(field === '_id' ? last._id : (last as Record<string, unknown>)[field], last._id) : null;
  return { items: page, nextCursor };
}
