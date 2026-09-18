import mongoose from 'mongoose';

/**
 * Single-document collection — the MySQL version enforced that with a
 * CHECK (id = 1) constraint. Here `getSettings()` is the only accessor
 * and upserts the singleton, so nothing else needs to know the id.
 */
const settingsSchema = new mongoose.Schema(
  {
    storeName: { type: String, default: 'Shope Clothes' },
    contactEmail: { type: String, default: 'hello@shopeclothes.test' },
    currency: { type: String, default: 'USD' },
    timezone: { type: String, default: 'Asia/Phnom_Penh' },
    taxRate: { type: Number, default: 0, min: 0 },
    flatShippingFee: { type: Number, default: 5, min: 0 },
    freeShippingThreshold: { type: Number, default: null },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
  },
  { timestamps: true }
);

export const Settings = mongoose.model('Settings', settingsSchema);

/** Returns the singleton, creating it with defaults on first call. */
export async function getSettings(session) {
  const query = Settings.findOneAndUpdate(
    {},
    { $setOnInsert: {} },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  if (session) query.session(session);
  return query;
}
