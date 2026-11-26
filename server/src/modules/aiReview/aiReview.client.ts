import { env } from '../../config/env';

/** One block of the user message: text, or a public https image the model may look at. */
export type ClaudeBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } };

const DEFAULT_MODEL = 'claude-haiku-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 20_000;

/**
 * Minimal Anthropic Messages API call (plain fetch: no SDK dependency in the serverless bundle).
 * Returns the model's text. Throws on HTTP errors, timeouts and empty replies; callers treat any throw
 * as "could not review" and leave the item for a human.
 */
export async function askClaude(system: string, content: ClaudeBlock[]): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.AI_REVIEW_MODEL || DEFAULT_MODEL, max_tokens: 400, temperature: 0, system, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Anthropic API returned no text');
  return text;
}
