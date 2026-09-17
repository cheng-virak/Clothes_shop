import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal.jsx';
import { applyInventoryImport } from '../../api/inventoryApi.js';

/**
 * Shows exactly what an import will change before it's applied. Any
 * unknown SKU blocks the "Apply" button entirely — the backend would
 * reject the whole batch anyway (all rows or none), so there's no point
 * offering a confirm action that's guaranteed to fail.
 */
export default function ImportPreviewModal({ rows, preview, onClose, onApplied }) {
  const [isApplying, setIsApplying] = useState(false);

  const unknownSkus = preview.filter((r) => !r.found);
  const changedRows = preview.filter((r) => r.found && r.delta !== 0);
  const unchangedCount = preview.filter((r) => r.found && r.delta === 0).length;
  const canApply = unknownSkus.length === 0 && changedRows.length > 0;

  async function handleApply() {
    setIsApplying(true);
    try {
      // Only send rows that actually change something — an unchanged row
      // would be a harmless no-op update, but it'd also write a pointless
      // audit_logs entry for "changed nothing to nothing".
      const changedSkus = new Set(changedRows.map((r) => r.sku));
      const rowsToApply = rows.filter((r) => changedSkus.has(r.sku));
      const res = await applyInventoryImport(rowsToApply);
      toast.success(`Updated stock for ${res.data.updatedCount} variant(s)`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Modal title="Import preview" onClose={onClose} width="max-w-2xl">
      {unknownSkus.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {unknownSkus.length} SKU{unknownSkus.length === 1 ? '' : 's'} not found — the whole import will be
          rejected until these are fixed or removed from the file:{' '}
          <span className="font-medium">{unknownSkus.map((r) => r.sku).join(', ')}</span>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Current</th>
              <th className="px-3 py-2">New</th>
              <th className="px-3 py-2">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {preview.map((r) => (
              <tr key={r.sku} className={!r.found ? 'bg-red-50' : r.delta === 0 ? 'text-stone-400' : ''}>
                <td className="px-3 py-2 font-medium">{r.sku}</td>
                <td className="px-3 py-2">
                  {r.found ? `${r.productTitle} (${r.size}, ${r.color})` : 'Not found'}
                </td>
                <td className="px-3 py-2">{r.found ? r.currentStock : '—'}</td>
                <td className="px-3 py-2">{r.newStock}</td>
                <td className="px-3 py-2">
                  {r.found ? (
                    <span className={r.delta > 0 ? 'text-green-700' : r.delta < 0 ? 'text-red-700' : ''}>
                      {r.delta > 0 ? '+' : ''}
                      {r.delta}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-stone-500">
        {changedRows.length} change{changedRows.length === 1 ? '' : 's'}, {unchangedCount} unchanged
        {unknownSkus.length > 0 ? `, ${unknownSkus.length} unknown` : ''}.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canApply || isApplying}
          onClick={handleApply}
          className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {isApplying ? 'Applying…' : `Apply ${changedRows.length} change${changedRows.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}
