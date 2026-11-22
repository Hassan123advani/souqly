import pino from 'pino';
import { env, isDev, isTest } from '../config/env';

const level = env.LOG_LEVEL ?? (isTest ? 'silent' : isDev ? 'debug' : 'info');

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'headers.authorization',
      'headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'code',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});
