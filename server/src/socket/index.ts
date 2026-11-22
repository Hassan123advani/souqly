import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { resolveAccessToken } from '../middleware/auth';
import { ACCESS_COOKIE, parseCookieHeader } from '../modules/auth/tokens';

let io: Server | undefined;

export const userRoom = (userId: string) => `user:${userId}`;

/** Attaches Socket.io; authenticates from the `sq_at` cookie and joins `user:{id}`. */
export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    serveClient: false,
  });

  io.use((socket, next) => {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    resolveAccessToken(cookies[ACCESS_COOKIE])
      .then((r) => {
        if (r instanceof AppError) return next(Object.assign(new Error(r.code), { data: { code: r.code } }));
        socket.data.user = r;
        next();
      })
      .catch(() => next(new Error('INTERNAL_ERROR')));
  });

  io.on('connection', (socket) => {
    const userId = (socket.data.user as { id: string }).id;
    void socket.join(userRoom(userId));
    logger.debug({ userId }, 'socket connected');
  });

  return io;
}

export function getIO(): Server | undefined {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

export async function closeSocket(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io!.close(() => resolve()));
  io = undefined;
}
