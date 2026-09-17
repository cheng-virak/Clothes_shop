/** Empty state that says what to do next, not just "nothing here". */
export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white py-16 text-center">
      <p className="text-sm font-medium text-stone-900">{title}</p>
      {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
