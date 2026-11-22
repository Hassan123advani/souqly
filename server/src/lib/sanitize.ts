import sanitizeHtmlLib from 'sanitize-html';

/** Allow-list for rich text written by sellers / admins (product descriptions, CMS pages). */
const RICH_TEXT: sanitizeHtmlLib.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtmlLib(html, RICH_TEXT);
}

/** Removes every tag; use for plain-text fields that might contain markup. */
export function stripHtml(input: string): string {
  return sanitizeHtmlLib(input, { allowedTags: [], allowedAttributes: {} }).trim();
}
