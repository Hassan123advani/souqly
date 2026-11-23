import { z } from 'zod';
import { logger } from '../../lib/logger';
import type { AuthUser } from '../../types/express';
import { canAccessConversation, convRoom } from './access';
import type { ChatSide } from './chat.models';

/** The subset of a socket.io Socket the chat handlers use (lets tests pass a fake). */
export interface ChatSocketLike {
  data: { user?: AuthUser; chatSides?: Record<string, ChatSide> };
  rooms: Set<string>;
  join(room: string): unknown;
  leave(room: string): unknown;
  on(event: string, fn: (...args: unknown[]) => void): unknown;
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

const joinSchema = z.object({ conversationId: z.string().regex(/^[a-f0-9]{24}$/i) });
const typingSchema = joinSchema.extend({ typing: z.boolean() });
type Ack = (r: { ok: boolean; error?: string }) => void;
const asAck = (a: unknown): Ack => (typeof a === 'function' ? (a as Ack) : () => undefined);

/** `chat:join`: only the conversation's buyer or store members with chat permission get into `conv:{id}`. */
export async function handleJoin(socket: ChatSocketLike, payload: unknown, ack?: unknown): Promise<boolean> {
  const reply = asAck(ack);
  const user = socket.data.user;
  const parsed = joinSchema.safeParse(payload);
  if (!user || !parsed.success) {
    reply({ ok: false, error: 'INVALID' });
    return false;
  }
  const access = await canAccessConversation(user.id, parsed.data.conversationId);
  if (!access) {
    reply({ ok: false, error: 'FORBIDDEN' });
    return false;
  }
  await socket.join(convRoom(parsed.data.conversationId));
  socket.data.chatSides = { ...(socket.data.chatSides ?? {}), [parsed.data.conversationId]: access.side };
  reply({ ok: true });
  return true;
}

export function registerChatSocket(socket: ChatSocketLike): void {
  socket.on('chat:join', (payload, ack) => {
    handleJoin(socket, payload, ack).catch((err) => {
      logger.warn({ err }, 'chat:join failed');
      asAck(ack)({ ok: false, error: 'INTERNAL_ERROR' });
    });
  });
  socket.on('chat:leave', (payload) => {
    const p = joinSchema.safeParse(payload);
    if (p.success) void socket.leave(convRoom(p.data.conversationId));
  });
  socket.on('chat:typing', (payload) => {
    const p = typingSchema.safeParse(payload);
    if (!p.success) return;
    const room = convRoom(p.data.conversationId);
    const side = socket.data.chatSides?.[p.data.conversationId];
    if (!socket.rooms.has(room) || !side) return; // must have joined (and been authorised) first
    socket.to(room).emit('chat:typing', { conversationId: p.data.conversationId, side, typing: p.data.typing });
  });
}
