import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
};

type ErrorBody = { code: string; message: string; details?: unknown };

function send(res: Parameters<ErrorRequestHandler>[2], status: number, body: ErrorBody) {
  res.status(status).json({ error: body });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    req.log?.error({ err }, 'Error after headers were sent');
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) (req.log ?? logger).error({ err }, err.message);
    return send(res, err.status, { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) });
  }

  if (err instanceof ZodError) {
    return send(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return send(res, status, { code: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid upload' });
  }

  if (err instanceof mongoose.Error.CastError) {
    return send(res, 400, { code: 'INVALID_ID', message: 'Invalid id' });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return send(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
  }

  const e = err as { code?: number; keyValue?: Record<string, unknown>; type?: string; status?: number };
  if (e?.code === 11000) {
    return send(res, 409, {
      code: 'DUPLICATE',
      message: 'This value is already in use',
      details: { fields: Object.keys(e.keyValue ?? {}) },
    });
  }
  // body-parser errors
  if (e?.type === 'entity.parse.failed') return send(res, 400, { code: 'INVALID_JSON', message: 'Malformed JSON body' });
  if (e?.type === 'entity.too.large') return send(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });

  (req.log ?? logger).error({ err }, 'Unhandled error');
  return send(res, 500, { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
};
