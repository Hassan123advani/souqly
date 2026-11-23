import { PERMISSIONS, productImportQuerySchema } from '@souqly/shared';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { requirePlanFeature } from '../plans/plan.service';
import { MAX_IMPORT_BYTES, exportProducts, importProducts, templateCsv } from './productCsv.service';

/**
 * `/seller/products/export.csv | import-template.csv | import` — mounted BEFORE the seller router so
 * these literal paths never hit `/products/:id`. storeId comes ONLY from req.store.
 */
export const sellerBulkRouter = Router();
const base = [requireAuth, storeContext, requirePermission(PERMISSIONS.STORE_PRODUCTS_MANAGE)];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 2 },
  fileFilter: (_req, file, cb) => {
    const okType = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream', 'application/csv'].includes(file.mimetype);
    if (okType && /\.csv$/i.test(file.originalname)) cb(null, true);
    else cb(new AppError(400, 'INVALID_FILE', 'Upload a .csv file'));
  },
});
const single: RequestHandler = (req, res, next) =>
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(new AppError(400, err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD', err.code === 'LIMIT_FILE_SIZE' ? 'The CSV must be 2 MB or smaller' : 'Invalid upload'));
    next(err as Error | undefined);
  });

sellerBulkRouter.get(
  '/products/export.csv',
  ...base,
  asyncHandler(async (req, res) => {
    await audit({ action: 'product.csv_exported', targetType: 'Store', targetId: req.store!._id, req });
    await exportProducts(res, req.store!._id);
  }),
);

sellerBulkRouter.get('/products/import-template.csv', ...base, (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="souqly-products-template.csv"');
  res.send(templateCsv());
});

sellerBulkRouter.post(
  '/products/import',
  ...base,
  requirePlanFeature('bulkUpload'),
  validate({ query: productImportQuerySchema }),
  single,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Attach the CSV as the "file" field');
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    const result = await importProducts(req, req.file.buffer, dryRun);
    res.status(dryRun || result.errors.length ? 200 : 201).json({ data: result });
  }),
);
