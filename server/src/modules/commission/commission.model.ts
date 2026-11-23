import { Schema, Types, model } from 'mongoose';

/**
 * Commission rule. Resolution order: store rule > deepest matching category rule > global rule.
 * Rates are basis points (1000 = 10%).
 */
export interface ICommissionRule {
  scope: 'global' | 'category' | 'store';
  categoryId?: Types.ObjectId | null;
  storeId?: Types.ObjectId | null;
  bps: number;
  isActive: boolean;
  demo: boolean;
}

const commissionRuleSchema = new Schema<ICommissionRule>(
  {
    scope: { type: String, enum: ['global', 'category', 'store'], required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
    bps: { type: Number, required: true, min: 0, max: 10_000 },
    isActive: { type: Boolean, default: true },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
commissionRuleSchema.index({ scope: 1, storeId: 1, categoryId: 1 }, { unique: true });

export const CommissionRule = model<ICommissionRule>('CommissionRule', commissionRuleSchema);

/** Platform default when no rule exists at all (D-056). */
export const DEFAULT_COMMISSION_BPS = 1000;

/**
 * Resolves the commission rate for one store order. `categoryPaths` are the category paths
 * (root → leaf) of the order's lines; the deepest category rule found on any line wins, and for
 * mixed-category orders the highest matching rate is used (conservative, D-056).
 */
export async function resolveCommissionBps(storeId: Types.ObjectId | string, categoryPaths: (Types.ObjectId | string)[][]): Promise<number> {
  const catIds = [...new Set(categoryPaths.flat().map(String))];
  const rules = await CommissionRule.find({
    isActive: true,
    $or: [
      { scope: 'store', storeId: new Types.ObjectId(String(storeId)) },
      { scope: 'category', categoryId: { $in: catIds.map((c) => new Types.ObjectId(c)) } },
      { scope: 'global' },
    ],
  }).lean();
  const store = rules.find((r) => r.scope === 'store');
  if (store) return store.bps;
  const byCat = new Map(rules.filter((r) => r.scope === 'category').map((r) => [String(r.categoryId), r.bps]));
  let best: number | undefined;
  for (const path of categoryPaths) {
    for (let i = path.length - 1; i >= 0; i--) {
      const bps = byCat.get(String(path[i]));
      if (bps !== undefined) {
        best = best === undefined ? bps : Math.max(best, bps);
        break;
      }
    }
  }
  if (best !== undefined) return best;
  return rules.find((r) => r.scope === 'global')?.bps ?? DEFAULT_COMMISSION_BPS;
}
