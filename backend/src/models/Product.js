import mongoose from 'mongoose';

/**
 * Variants and images are EMBEDDED rather than separate collections.
 *
 * In the MySQL schema these were `product_variants` and `product_images`,
 * joined on every read. They're always loaded with their product, they're
 * bounded (a product has a handful of size/colour combos, not thousands),
 * and nothing reads a variant without its product — which is exactly the
 * shape MongoDB wants embedded. Embedding also makes stock updates a
 * single-document atomic operation, which is what replaces the
 * `SELECT ... FOR UPDATE` row locking the SQL version needed.
 *
 * The `sizes` and `colors` lookup tables are gone entirely: they existed
 * to normalise two short strings, and are now just fields on the variant.
 */
const variantSchema = new mongoose.Schema(
  {
    // Apparel sizes, 'ONE_SIZE' (no size selector shown on the storefront),
    // or belt waist sizes in inches. Mirrors SIZE_CODES in the validator.
    size: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    colorHex: { type: String, trim: true, default: null },
    sku: { type: String, required: true, trim: true },
    // null means "inherit the product's basePrice" — same meaning the
    // nullable price_override column had.
    priceOverride: { type: Number, default: null, min: 0 },
    stockQuantity: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: true }
);

const imageSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Immutable after creation, same as the SQL version: changing it
    // breaks any existing link to the product.
    slug: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: null, maxlength: 5000 },
    basePrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    variants: { type: [variantSchema], default: [] },
    images: { type: [imageSchema], default: [] },
  },
  { timestamps: true }
);

// Storefront reads are always "active products, optionally in a category".
productSchema.index({ status: 1, category: 1 });
// Admin search + storefront search both match on title.
productSchema.index({ title: 'text', description: 'text' });
// SKUs must stay unique across every product, not just within one —
// the CSV inventory import looks a variant up by SKU alone.
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });

/** Price a shopper actually pays for a given variant. */
productSchema.methods.priceFor = function priceFor(variant) {
  return variant.priceOverride ?? this.basePrice;
};

export const Product = mongoose.model('Product', productSchema);
