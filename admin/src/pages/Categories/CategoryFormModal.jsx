import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal.jsx';
import { checkCategorySlug, createCategory, updateCategory } from '../../api/adminCategoriesApi.js';

function slugPreview(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Shared create/edit modal. `category` present = editing (slug is shown
 * but frozen — see the backend's comment on why it's immutable post-
 * creation). `topLevelCategories` is the parent dropdown's option list —
 * only top-level categories are valid parents (one level of nesting).
 */
export default function CategoryFormModal({ category, topLevelCategories, onClose, onSaved }) {
  const isEditing = Boolean(category);
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category?.parent_id ?? '');
  const [imageUrl, setImageUrl] = useState(category?.image_url ?? '');
  const [slugStatus, setSlugStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef(null);

  // Only offer top-level categories as a parent choice, and (when editing)
  // never the category itself.
  const parentOptions = topLevelCategories.filter((c) => c.id !== category?.id);

  useEffect(() => {
    if (isEditing) return; // slug is frozen once created — no live check needed
    if (!name.trim()) {
      setSlugStatus(null);
      return;
    }
    setSlugStatus('checking');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      checkCategorySlug(slugPreview(name))
        .then((res) => setSlugStatus(res.data.available ? 'available' : 'taken'))
        .catch(() => setSlugStatus(null));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [name, isEditing]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!isEditing && slugStatus === 'taken') {
      toast.error('That name produces a slug that is already in use');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        await updateCategory(category.id, {
          name: name.trim(),
          parentId: parentId === '' ? null : parentId,
          imageUrl: imageUrl.trim() || null,
        });
        toast.success('Category updated');
      } else {
        await createCategory({
          name: name.trim(),
          parentId: parentId === '' ? undefined : parentId,
          imageUrl: imageUrl.trim() || undefined,
        });
        toast.success('Category created');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={isEditing ? 'Edit category' : 'New category'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Name</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Slug</label>
          {isEditing ? (
            <input
              type="text"
              value={category.slug}
              disabled
              title="Slugs aren't editable — changing one breaks any existing filtered-URL link."
              className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-400"
            />
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name ? slugPreview(name) : ''}
                disabled
                className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-500"
              />
              {slugStatus === 'checking' && <span className="shrink-0 text-xs text-stone-400">Checking…</span>}
              {slugStatus === 'available' && <span className="shrink-0 text-xs text-green-600">Available</span>}
              {slugStatus === 'taken' && <span className="shrink-0 text-xs text-red-600">Taken</span>}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Parent category</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-500">Image URL</label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
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
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create category'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
