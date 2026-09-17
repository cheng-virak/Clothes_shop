import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineArrowDown, HiOutlineArrowUp, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';
import TableSkeleton from '../../components/TableSkeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { listCategories, reorderCategory, deleteCategory } from '../../api/adminCategoriesApi.js';
import CategoryFormModal from './CategoryFormModal.jsx';

export default function CategoriesList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [formTarget, setFormTarget] = useState(null); // null closed, {} = new, category object = edit
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const q = searchParams.get('q') || '';

  function reload() {
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listCategories()
      .then((res) => {
        if (!cancelled) setCategories(res.data);
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
  }, [reloadToken]);

  function updateQuery(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const topLevel = (categories ?? []).filter((c) => c.parent_id === null);
  const filtered = (categories ?? []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  // Group children directly under their parent so the tree reads visually,
  // even though the query result and the table rows are both flat.
  const rows = [];
  for (const top of filtered.filter((c) => c.parent_id === null)) {
    rows.push(top);
    rows.push(...filtered.filter((c) => c.parent_id === top.id));
  }
  // A search match on a child whose parent got filtered out by the same
  // search still needs to show — otherwise it's an orphaned, confusing row.
  for (const child of filtered.filter((c) => c.parent_id !== null)) {
    if (!rows.includes(child)) rows.push(child);
  }

  async function handleReorder(id, direction) {
    setBusyId(id);
    try {
      const res = await reorderCategory(id, direction);
      if (!res.data.moved) toast('Already at that end', { icon: 'ℹ️' });
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function handleDeleteClick(category) {
    if (category.product_count > 0) {
      toast.error(
        `${category.product_count} product${category.product_count === 1 ? '' : 's'} use "${category.name}" — move ${
          category.product_count === 1 ? 'it' : 'them'
        } to another category first.`
      );
      return;
    }
    setDeleteTarget(category);
  }

  async function handleConfirmDelete() {
    try {
      await deleteCategory(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900">Categories</h1>
        <button
          type="button"
          onClick={() => setFormTarget({})}
          className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-700"
        >
          New category
        </button>
      </div>

      <div className="mb-4">
        <input
          type="search"
          defaultValue={q}
          placeholder="Search categories…"
          onKeyDown={(e) => e.key === 'Enter' && updateQuery('q', e.currentTarget.value)}
          onBlur={(e) => updateQuery('q', e.currentTarget.value)}
          className="w-64 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {!isLoading && error && <ErrorState message={error} onRetry={reload} />}

      {!isLoading && !error && rows.length === 0 && q && (
        <EmptyState
          title={`No categories match "${q}"`}
          description="Try a different search term."
          action={
            <button
              type="button"
              onClick={() => updateQuery('q', '')}
              className="text-sm font-medium text-stone-700 underline hover:text-stone-900"
            >
              Clear search
            </button>
          }
        />
      )}

      {!isLoading && !error && rows.length === 0 && !q && (
        <EmptyState
          title="No categories yet"
          description="Create your first category to start organizing products."
          action={
            <button
              type="button"
              onClick={() => setFormTarget({})}
              className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-700"
            >
              New category
            </button>
          }
        />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Slug</th>
                <th className="px-4 py-2.5">Parent</th>
                <th className="px-4 py-2.5">Products</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((cat) => (
                <tr key={cat.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-3 ${cat.parent_id ? 'pl-6' : ''}`}>
                      <img
                        src={cat.image_url || 'https://placehold.co/48x48?text=%E2%80%94'}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md border border-stone-200 object-cover"
                      />
                      <span className="font-medium text-stone-900">{cat.name}</span>
                      {cat.child_count > 0 && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                          {cat.child_count} sub
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-500">{cat.slug}</td>
                  <td className="px-4 py-3 text-stone-600">{cat.parent_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700">
                      {cat.product_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={busyId === cat.id}
                        onClick={() => handleReorder(cat.id, 'up')}
                        aria-label="Move up"
                        className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
                      >
                        <HiOutlineArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === cat.id}
                        onClick={() => handleReorder(cat.id, 'down')}
                        aria-label="Move down"
                        className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
                      >
                        <HiOutlineArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormTarget(cat)}
                        aria-label="Edit"
                        className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                      >
                        <HiOutlinePencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(cat)}
                        aria-label="Delete"
                        className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <HiOutlineTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formTarget && (
        <CategoryFormModal
          category={formTarget.id ? formTarget : null}
          topLevelCategories={topLevel}
          onClose={() => setFormTarget(null)}
          onSaved={reload}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete category"
          message={`Delete "${deleteTarget.name}"? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
