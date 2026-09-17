import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate } from '@shope/shared/format';
import { listAdminProducts, updateProductStatus, deleteProduct } from '../../api/adminProductsApi.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import NewProductModal from './NewProductModal.jsx';

const STATUS_BADGE = {
  draft: 'bg-stone-200 text-stone-600',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-red-100 text-red-800',
};

export default function ProductsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const q = searchParams.get('q') || '';
  const status = searchParams.get('status') || '';
  const stockState = searchParams.get('stockState') || '';
  const sort = searchParams.get('sort') || 'newest';
  const page = Number(searchParams.get('page') || 1);

  function reload() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listAdminProducts({ q, status, stockState, sort, page, limit: 20 })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, status, stockState, sort, page, reloadToken]);

  function updateParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  async function handleArchiveToggle(product) {
    const nextStatus = product.status === 'archived' ? 'draft' : 'archived';
    setBusyId(product.id);
    try {
      await updateProductStatus(product.id, nextStatus);
      toast.success(nextStatus === 'archived' ? 'Product archived' : 'Product restored to draft');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    try {
      const res = await deleteProduct(deleteTarget.id);
      toast.success(
        res.data.orderCount > 0
          ? `"${deleteTarget.title}" deleted — its ${res.data.orderCount} past order${res.data.orderCount === 1 ? '' : 's'} keep their line-item history`
          : `"${deleteTarget.title}" deleted`
      );
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Products</h1>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-700"
        >
          New product
        </button>
      </div>

      {isCreating && (
        <NewProductModal
          onClose={() => setIsCreating(false)}
          onCreated={(id) => navigate(`/products/${id}`)}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          defaultValue={q}
          placeholder="Search title or SKU…"
          onKeyDown={(e) => e.key === 'Enter' && updateParam('q', e.currentTarget.value)}
          onBlur={(e) => updateParam('q', e.currentTarget.value)}
          className="w-64 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => updateParam('status', e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={stockState}
          onChange={(e) => updateParam('stockState', e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="">All stock levels</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="newest">Recently updated</option>
          <option value="title_asc">Title A–Z</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="stock_asc">Stock: low to high</option>
          <option value="stock_desc">Stock: high to low</option>
        </select>
      </div>

      {isLoading && <p className="py-16 text-center text-sm text-stone-500">Loading…</p>}
      {!isLoading && error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}

      {!isLoading && !error && result && (
        <>
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Price</th>
                  <th className="px-4 py-2.5">Stock</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
                      No products match these filters.
                    </td>
                  </tr>
                )}
                {result.data.map((product) => (
                  <tr key={product.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link to={`/products/${product.id}`} className="flex items-center gap-3">
                        <img
                          src={product.thumbnail || 'https://placehold.co/48x60?text=No+Image'}
                          alt=""
                          className="h-12 w-9 shrink-0 rounded object-cover"
                        />
                        <span className="font-medium text-stone-900 hover:underline">{product.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{product.category_name}</td>
                    <td className="px-4 py-3 text-stone-600">
                      {product.min_price === product.max_price
                        ? formatCurrency(product.min_price)
                        : `${formatCurrency(product.min_price)} – ${formatCurrency(product.max_price)}`}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{product.total_stock}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_BADGE[product.status] ?? 'bg-stone-100 text-stone-600'}`}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-500">{formatDate(product.updated_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          disabled={busyId === product.id}
                          onClick={() => handleArchiveToggle(product)}
                          className="text-xs font-medium text-stone-500 underline hover:text-stone-900 disabled:opacity-50"
                        >
                          {product.status === 'archived' ? 'Restore' : 'Archive'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(product)}
                          className="text-xs font-medium text-red-500 underline hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
              <span>
                Page {result.meta.page} of {result.meta.totalPages} · {result.meta.total} products
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => updateParam('page', String(page - 1))}
                  className="rounded-md border border-stone-300 px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= result.meta.totalPages}
                  onClick={() => updateParam('page', String(page + 1))}
                  className="rounded-md border border-stone-300 px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete product"
          message={`Delete "${deleteTarget.title}"? This permanently removes it, its variants, and its images. If it's ever been ordered, those past orders keep their line-item details but lose their live link to this product. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
