/** Error state with a real Retry action — never just dead text. */
export default function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white py-16 text-center text-sm">
      <p className="text-red-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 font-medium text-stone-700 underline hover:text-stone-900"
      >
        Retry
      </button>
    </div>
  );
}
