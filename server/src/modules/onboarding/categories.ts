import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { Category } from '../catalog/category.model';

/** All ids must be active categories. Returns them de-duplicated as ObjectIds. */
export async function assertActiveCategories(ids: string[]): Promise<Types.ObjectId[]> {
  const unique = [...new Set(ids.map((i) => i.toLowerCase()))];
  const found = await Category.countDocuments({ _id: { $in: unique }, isActive: true });
  if (found !== unique.length) throw new AppError(400, 'INVALID_CATEGORY', 'Choose valid categories');
  return unique.map((id) => new Types.ObjectId(id));
}
