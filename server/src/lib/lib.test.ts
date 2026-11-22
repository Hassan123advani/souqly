import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, randomDigits, sha256 } from './crypto';
import { cursorFilter, decodeCursor, encodeCursor, paginate } from './pagination';
import { sanitizeRichText, stripHtml } from './sanitize';

describe('cursor pagination', () => {
  it('round-trips numbers and dates', () => {
    const id = new Types.ObjectId();
    expect(decodeCursor(encodeCursor(42, id))).toEqual({ v: 42, id });
    const d = new Date('2026-01-01T00:00:00Z');
    expect(decodeCursor(encodeCursor(d, id)).v).toEqual(d);
  });

  it('rejects garbage and object injection', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow();
    const evil = Buffer.from(JSON.stringify({ v: { $gt: '' }, id: String(new Types.ObjectId()) })).toString('base64url');
    expect(() => decodeCursor(evil)).toThrow();
  });

  it('builds a tie-breaking filter and next cursor', () => {
    const id = new Types.ObjectId();
    expect(cursorFilter('price', -1, encodeCursor(500, id))).toEqual({
      $or: [{ price: { $lt: 500 } }, { price: 500, _id: { $lt: id } }],
    });
    const items = [1, 2, 3].map((n) => ({ _id: new Types.ObjectId(), price: n }));
    const page = paginate(items, 2, 'price');
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor!).v).toBe(2);
    expect(paginate(items, 5, 'price').nextCursor).toBeNull();
  });
});

describe('crypto', () => {
  it('encrypts with AES-GCM and detects tampering', () => {
    const enc = encrypt('JBSWY3DPEHPK3PXP');
    expect(decrypt(enc)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, ct] = enc.split('.');
    const tampered = [iv, tag, Buffer.from('x').toString('base64url') + ct].join('.');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('generates digits and hashes', () => {
    expect(randomDigits(6)).toMatch(/^\d{6}$/);
    expect(sha256('a')).toHaveLength(64);
  });
});

describe('sanitize', () => {
  it('removes scripts and unsafe links', () => {
    const out = sanitizeRichText('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('javascript:');
    expect(stripHtml('<b>bold</b> text')).toBe('bold text');
  });
});
