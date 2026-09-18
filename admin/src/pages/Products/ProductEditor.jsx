import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate } from '@shope/shared/format';
import { getAdminProduct, updateProduct, updateVariant, updateProductStatus } from '../../api/adminProductsApi.js';
import { listCategories } from '../../api/categoriesApi.js';
import ProductImagesTab from './ProductImagesTab.jsx';

const TABS = ['Details', 'Images'];

export default function ProductEditor() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState('Details');
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const reload = useCallback(() => {
    setIsLoading(true);
    getAdminProduct(id)
      .then((res) => setProduct(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    listCategories()
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([])); // dropdown just stays empty; not fatal to the page
  }, []);

  async function handleStatusChange(nextStatus) {
    setIsChangingStatus(true);
    try {
      await updateProductStatus(id, nextStatus);
      toast.success(`Status changed to ${nextStatus}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsChangingStatus(false);
    }
  }

  if (isLoading) return <p className="py-16 text-center text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="py-16 text-center text-sm text-red-600">{error}</p>;
  if (!product) return null;

  return (
    <div>
      <Link to="/products" className="mb-4 inline-block text-sm text-stone-500 hover:text-stone-900">
        ← Back to products
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{product.title}</h1>
          <p className="text-sm text-stone-500">
            {product.category_name} · Last updated {formatDate(product.updated_at)}
          </p>
        </div>
        <select
          value={product.status}
          disabled={isChangingStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium capitalize disabled:opacity-50"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="mb-6 flex gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-b-2 border-stone-900 text-stone-900' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Details' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <OverviewForm product={product} categories={categories} onSaved={reload} />
          <VariantsTable product={product} onSaved={reload} />
        </div>
      )}

      {tab === 'Images' && <ProductImagesTab productId={product.id} images={product.images} onChanged={reload} />}
    </div>
  );
}

function OverviewForm({ product, categories, onSaved }) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description ?? '');
  const [categoryId, setCategoryId] = useState(product.category_id);
  const [basePrice, setBasePrice] = useState(String(product.base_price));
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync local form state whenever the product prop actually changes
  // underneath it (e.g. after a save reloads from the server) — not on
  // every render, so mid-edit keystrokes aren't clobbered.
  useEffect(() => {
    setTitle(product.title);
    setDescription(product.description ?? '');
    setCategoryId(product.category_id);
    setBasePrice(String(product.base_price));
  }, [product]);

  const isDirty =
    title !== product.title ||
    description !== (product.description ?? '') ||
    categoryId !== product.category_id ||
    Number(basePrice) !== Number(product.base_price);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const price = Number(basePrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Base price must be a positive number');
      return;
    }

    setIsSaving(true);
    try {
      await updateProduct(product.id, {
        title: title.trim(),
        description: description.trim() || null,
        categoryId,
        basePrice: price,
      });
      toast.success('Product updated');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-stone-900">Overview</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Slug</label>
          <input
            type="text"
            value={product.slug}
            disabled
            title="Slugs aren't editable — changing one breaks any existing link to this product."
            className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-500">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            >
              {categories.length === 0 && <option value={product.category_id}>{product.category_name}</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={!isDirty || isSaving}
          className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  );
}

function VariantsTable({ product, onSaved }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-stone-900">Variants</h2>
      <p className="mb-3 text-xs text-stone-500">
        Price overrides the base price for that size/color only — clear it to fall back to the base price.
      </p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-stone-400">
          <tr>
            <th className="pb-2">Size</th>
            <th className="pb-2">Color</th>
            <th className="pb-2">SKU</th>
            <th className="pb-2">Price</th>
            <th className="pb-2">Stock</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {product.variants.map((v) => (
            <VariantRow key={v.variantId} productId={product.id} variant={v} basePrice={product.base_price} onSaved={onSaved} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function VariantRow({ productId, variant, basePrice, onSaved }) {
  const [price, setPrice] = useState(String(variant.price));
  const [stock, setStock] = useState(String(variant.stockQuantity));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPrice(String(variant.price));
    setStock(String(variant.stockQuantity));
  }, [variant]);

  const isDirty = Number(price) !== Number(variant.price) || Number(stock) !== Number(variant.stockQuantity);

  async function handleSave() {
    const priceNum = Number(price);
    const stockNum = Number(stock);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Price must be a positive number');
      return;
    }
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      toast.error('Stock must be a non-negative whole number');
      return;
    }

    setIsSaving(true);
    try {
      // Only send priceOverride if it actually differs from the base
      // price — otherwise every variant would end up with a redundant
      // override equal to the base price the moment anyone edits stock.
      const fields = { stockQuantity: stockNum };
      fields.priceOverride = priceNum === Number(basePrice) ? null : priceNum;
      await updateVariant(productId, variant.variantId, fields);
      toast.success('Variant updated');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <tr>
      <td className="py-1.5">{variant.size}</td>
      <td className="py-1.5">{variant.color}</td>
      <td className="py-1.5 text-stone-500">{variant.sku}</td>
      <td className="py-1.5">
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-md border border-stone-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="py-1.5">
        <input
          type="number"
          step="1"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-20 rounded-md border border-stone-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="py-1.5 text-right">
        <button
          type="button"
          disabled={!isDirty || isSaving}
          onClick={handleSave}
          className="text-xs font-medium text-stone-500 underline hover:text-stone-900 disabled:opacity-40"
        >
          Save
        </button>
      </td>
    </tr>
  );
}
