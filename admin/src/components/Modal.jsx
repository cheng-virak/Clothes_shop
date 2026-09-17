import { useEffect } from 'react';
import { HiOutlineX } from 'react-icons/hi';

/** Generic centered modal — backdrop click and Escape both close it. */
export default function Modal({ title, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${width} rounded-lg bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <HiOutlineX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
