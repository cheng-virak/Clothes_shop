import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import Modal from '../../components/Modal.jsx';
import { listCategories } from '../../api/adminCategoriesApi.js';
import { createProduct } from '../../api/adminProductsApi.js';

// Matches backend/src/validators/product.validator.js's SIZE_CODES —
// apparel sizes, 'ONE_SIZE' (totes/beanies/sunglasses — no size selector
// shown on the storefront), and belt waist sizes in inches.
const SIZE_CODES = ['S', 'M', 'L', 'XL', 'XXL', 'ONE_SIZE', '30', '32', '34', '36'];

function emptyVariant() {
  return { sizeCode: 'M', colorName: '', colorHex: '#000000', sku: '', stockQuantity: '0' };
}

/**
 * Creates a product with its starting variants only — no image picker
 * here on purpose (images: [] is sent). The backend leaves the new
 * product as 'draft', and onCreated navigates straight to its editor's
 * Images tab so uploading real photos is the very next step, not a
 * separate flow to remember later.
 */
export default function NewProductModal({ onClose, onCreated }) {
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [description, setDescription] = useState('');
  const [variants, setVariants] = useState([emptyVariant()]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listCategories()
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  function updateVariant(index, patch) {
    setVariants((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addVariant() {
    setVariants((rows) => [...rows, emptyVariant()]);
  }
  function removeVariant(index) {
    setVariants((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!title.trim()) return toast.error('Title is required');
    if (!categoryId) return toast.error('Category is required');
    const price = Number(basePrice);
    if (!Number.isFinite(price) || price <= 0) return toast.error('Base price must be a positive number');
    if (variants.length === 0) return toast.error('At least one size/color variant is required');
    for (const v of variants) {
      if (!v.colorName.trim()) return toast.error('Every variant needs a color name');
      if (!v.sku.trim()) return toast.error('Every variant needs a SKU');
      const stock = Number(v.stockQuantity);
      if (!Number.isInteger(stock) || stock < 0) return toast.error(`Invalid stock quantity for ${v.sku}`);
    }

    setIsSaving(true);
    try {
      const res = await createProduct({
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId: Number(categoryId),
        basePrice: price,
        variants: variants.map((v) => ({
          sizeCode: v.sizeCode,
          colorName: v.colorName.trim(),
          colorHex: v.colorHex || undefined,
          sku: v.sku.trim(),
          stockQuantity: Number(v.stockQuantity),
        })),
      });
      toast.success('Product created as a draft — add photos next');
      onCreated(res.data.id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="New product" onClose={onClose} width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_name ? `${c.parent_name} > ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Base price</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-stone-500">Description (optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-stone-500">Starting variants</label>
            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"
            >
              <HiOutlinePlus size={14} /> Add variant
            </button>
          </div>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={v.sizeCode}
                  onChange={(e) => updateVariant(i, { sizeCode: e.target.value })}
                  className="w-20 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  {SIZE_CODES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Color name"
                  value={v.colorName}
                  onChange={(e) => updateVariant(i, { colorName: e.target.value })}
                  className="w-28 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
                <input
                  type="color"
                  value={v.colorHex}
                  onChange={(e) => updateVariant(i, { colorHex: e.target.value })}
                  className="h-8 w-8 shrink-0 rounded border border-stone-300"
                />
                <input
                  type="text"
                  placeholder="SKU"
                  value={v.sku}
                  onChange={(e) => updateVariant(i, { sku: e.target.value })}
                  className="w-28 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Stock"
                  value={v.stockQuantity}
                  onChange={(e) => updateVariant(i, { stockQuantity: e.target.value })}
                  className="w-20 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeVariant(i)}
                  disabled={variants.length === 1}
                  aria-label="Remove variant"
                  className="shrink-0 rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  <HiOutlineTrash size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? 'Creating…' : 'Create product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
