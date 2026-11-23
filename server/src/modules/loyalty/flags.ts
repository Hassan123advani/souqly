import type { FeatureFlag } from '@souqly/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../../lib/AppError';
import { getFeatureFlags } from '../settings/settings.service';

export async function isFlagOn(flag: FeatureFlag): Promise<boolean> {
  try {
    return !!(await getFeatureFlags())[flag];
  } catch {
    return false;
  }
}

/** 404 FEATURE_DISABLED while the flag is off. */
export function requireFlag(flag: FeatureFlag): RequestHandler {
  return (_req, _res, next) => {
    isFlagOn(flag).then(
      (on) => next(on ? undefined : new AppError(404, 'FEATURE_DISABLED', 'This feature is not available')),
      next,
    );
  };
}
