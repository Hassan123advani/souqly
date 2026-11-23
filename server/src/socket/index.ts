import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { resolveAccessToken } from '../middleware/auth';
import { ACCESS_COOKIE, parseCookieHeader } from '../modules/auth/tokens';
import { StoreMember } from '../modules/stores/storeMember.model';
import type { AuthUser } from '../types/express';

let io: Server | undefined;

export const userRoom = (userId: string) => `user:${userId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;
export const storeRoom = (storeId: string) => `store:${storeId}`;

const clientOrigin = (() => {
  try {
    return new URL(env.CLIENT_URL).origin;
  } catch {
    return env.CLIENT_URL;
  }
})();

/**
 * Cross-site WebSocket hijacking guard: browsers always send Origin on WebSocket handshakes and
 * cross-origin polling, so any Origin other than the client's is refused. Requests without an Origin
 * (same-origin polling, non-browser clients) carry no ambient-cookie risk and are allowed.
 */
export function isAllowedSocketOrigin(origin: string | undefined): boolean {
  return !origin || origin === clientOrigin;
}

/** Attaches Socket.io; authenticates from the `sq_at` cookie and joins `user:{id}` + `session:{sid}`. */
export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    serveClient: false,
    allowRequest: (req: IncomingMessage, cb) => {
      const ok = isAllowedSocketOrigin(req.headers.origin);
      if (!ok) logger.warn({ origin: req.headers.origin }, 'Socket handshake from a foreign origin refused');
      cb(null, ok);
    },
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
    const user = socket.data.user as AuthUser;
    void socket.join([userRoom(user.id), sessionRoom(user.sessionId)]);
    // Seller Center live alerts: join `store:{id}` for every store the user is an active member of.
    StoreMember.find({ userId: user.id, status: 'active' })
      .select('storeId')
      .lean()
      .then((members) => {
        if (members.length) void socket.join(members.map((m) => storeRoom(String(m.storeId))));
      })
      .catch((err) => logger.warn({ err }, 'Failed to join store rooms'));
    logger.debug({ userId: user.id }, 'socket connected');
  });

  return io;
}

export function getIO(): Server | undefined {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToStore(storeId: string, event: string, payload: unknown): void {
  io?.to(storeRoom(storeId)).emit(event, payload);
}

/** Disconnects the sockets of one (revoked) session. */
export function disconnectSessionSockets(sessionId: string): void {
  io?.in(sessionRoom(sessionId)).disconnectSockets(true);
}

/** Disconnects all sockets of a user, optionally keeping those of one session. Never throws. */
export async function disconnectUserSockets(userId: string, exceptSessionId?: string): Promise<void> {
  if (!io) return;
  try {
    if (!exceptSessionId) {
      io.in(userRoom(userId)).disconnectSockets(true);
      return;
    }
    io.in(userRoom(userId)).except(sessionRoom(exceptSessionId)).disconnectSockets(true);
  } catch (err) {
    logger.warn({ err }, 'Failed to disconnect sockets');
  }
}

export async function closeSocket(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io!.close(() => resolve()));
  io = undefined;
}
