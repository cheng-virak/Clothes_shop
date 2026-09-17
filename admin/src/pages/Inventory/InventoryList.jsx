import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineDownload, HiOutlineUpload } from 'react-icons/hi';
import TableSkeleton from '../../components/TableSkeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { listInventory, previewInventoryImport } from '../../api/inventoryApi.js';
import { updateVariant } from '../../api/adminProductsApi.js';
import { listCategories } from '../../api/adminCategoriesApi.js';
import { toCsv, downloadCsv, parseCsv } from '../../utils/csv.js';
import ImportPreviewModal from './ImportPreviewModal.jsx';

const PAGE_SIZE = 20;

export default function InventoryList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [categories, setCategories] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [importState, setImportState] = useState(null); // { rows, preview } while the preview modal is open
  const fileInputRef = useRef(null);

  const lowStock = searchParams.get('lowStock') === 'true';
  const outOfStock = searchParams.get('outOfStock') === 'true';
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || 'stock_asc';
  const page = Number(searchParams.get('page') || 1);

  function reload() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    listCategories()
      .then((res) => setCategories(res.data.filter((c) => c.parent_id === null)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listInventory({ lowStock, outOfStock, category, sort, page, limit: PAGE_SIZE })
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
  }, [lowStock, outOfStock, category, sort, page, reloadToken]);

  function updateQuery(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in patch)) next.delete('page');
    setSearchParams(next);
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      // Export the current filters, not just the current page.
      const all = await listInventory({ lowStock, outOfStock, category, sort, limit: 1000 });
      downloadCsv('inventory.csv', toCsv(all.data.map((r) => ({ sku: r.sku, stock_quantity: r.stock_quantity }))));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const preview = await previewInventoryImport(rows);
      setImportState({ rows, preview: preview.data });
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Inventory</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            <HiOutlineUpload size={16} /> Import CSV
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            <HiOutlineDownload size={16} /> {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => updateQuery({ lowStock: e.target.checked ? 'true' : '', outOfStock: '' })}
            className="h-4 w-4 rounded border-stone-300"
          />
          Low stock only
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={outOfStock}
            onChange={(e) => updateQuery({ outOfStock: e.target.checked ? 'true' : '', lowStock: '' })}
            className="h-4 w-4 rounded border-stone-300"
          />
          Out of stock only
        </label>
        <select
          value={category}
          onChange={(e) => updateQuery({ category: e.target.value })}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => updateQuery({ sort: e.target.value })}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          <option value="stock_asc">Stock: low to high</option>
          <option value="stock_desc">Stock: high to low</option>
        </select>
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {!isLoading && error && <ErrorState message={error} onRetry={reload} />}

      {!isLoading && !error && result && result.data.length === 0 && (
        <EmptyState
          title="No variants match these filters"
          description="Try clearing the low stock / out of stock / category filters."
          action={
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="text-sm font-medium text-stone-700 underline hover:text-stone-900"
            >
              Clear filters
            </button>
          }
        />
      )}

      {!isLoading && !error && result && result.data.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5">Color</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Stock</th>
                  <th className="px-4 py-2.5">Threshold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.data.map((row) => (
                  <InventoryRow
                    key={row.variant_id}
                    row={row}
                    threshold={result.meta.lowStockThreshold}
                    isEditing={editingId === row.variant_id}
                    onEditStart={() => setEditingId(row.variant_id)}
                    onEditEnd={() => setEditingId(null)}
                    onSaved={reload}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {result.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
              <span>
                Page {result.meta.page} of {result.meta.totalPages} · {result.meta.total} variants
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => updateQuery({ page: String(page - 1) })}
                  className="rounded-md border border-stone-300 px-3 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= result.meta.totalPages}
                  onClick={() => updateQuery({ page: String(page + 1) })}
                  className="rounded-md border border-stone-300 px-3 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {importState && (
        <ImportPreviewModal
          rows={importState.rows}
          preview={importState.preview}
          onClose={() => setImportState(null)}
          onApplied={reload}
        />
      )}
    </div>
  );
}

function InventoryRow({ row, threshold, isEditing, onEditStart, onEditEnd, onSaved }) {
  const [value, setValue] = useState(String(row.stock_quantity));
  const [displayStock, setDisplayStock] = useState(row.stock_quantity);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayStock(row.stock_quantity);
    setValue(String(row.stock_quantity));
  }, [row.stock_quantity]);

  async function handleSave() {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) {
      toast.error('Stock must be a non-negative whole number');
      setValue(String(displayStock));
      onEditEnd();
      return;
    }
    if (next === displayStock) {
      onEditEnd();
      return;
    }

    const previous = displayStock;
    setDisplayStock(next); // optimistic
    setIsSaving(true);
    onEditEnd();
    try {
      await updateVariant(row.product_id, row.variant_id, { stockQuantity: next });
      toast.success(`Stock updated for ${row.sku}`);
      onSaved();
    } catch (err) {
      setDisplayStock(previous); // rollback
      setValue(String(previous));
      toast.error(`${err.message} — reverted`);
    } finally {
      setIsSaving(false);
    }
  }

  const isLow = displayStock === 0 ? 'out' : displayStock <= threshold ? 'low' : 'ok';

  return (
    <tr className="hover:bg-stone-50">
      <td className="px-4 py-3 font-medium text-stone-900">{row.product_title}</td>
      <td className="px-4 py-3 text-stone-600">{row.size}</td>
      <td className="px-4 py-3 text-stone-600">{row.color}</td>
      <td className="px-4 py-3 text-stone-500">{row.sku}</td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            type="number"
            min="0"
            step="1"
            autoFocus
            defaultValue={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') onEditEnd();
            }}
            className="w-20 rounded-md border border-stone-300 px-2 py-1 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={onEditStart}
            disabled={isSaving}
            className={`rounded-md px-2 py-1 text-sm font-semibold hover:bg-stone-100 disabled:opacity-50 ${
              isLow === 'out' ? 'text-red-700' : isLow === 'low' ? 'text-amber-700' : 'text-stone-700'
            }`}
          >
            {isSaving ? '…' : displayStock}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-stone-400">{threshold}</td>
    </tr>
  );
}
