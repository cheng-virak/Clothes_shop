import mongoose from 'mongoose';

/**
 * Kept as its own collection rather than embedded: categories are shared
 * across products and edited independently, so embedding would duplicate
 * them into every product and make a rename an N-document update.
 *
 * One level of nesting only — a category may have a parent, but a
 * category that has a parent may not itself be a parent. That rule has no
 * database-level equivalent here (Mongo has no foreign keys), so it's
 * enforced in the controller, same as the "refuse to delete a category
 * that still has products" rule that ON DELETE RESTRICT used to give us.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    imageUrl: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ parent: 1, sortOrder: 1 });

export const Category = mongoose.model('Category', categorySchema);
