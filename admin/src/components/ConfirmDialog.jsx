import { useState } from 'react';
import Modal from './Modal.jsx';

/**
 * Confirm dialog for anything destructive. `message` should name exactly
 * what is being changed (the caller is responsible for that specificity —
 * this component just renders it prominently).
 */
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel, danger = true }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-stone-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-900 hover:bg-stone-700'
          }`}
        >
          {isSubmitting ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
