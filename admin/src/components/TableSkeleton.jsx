/** Loading skeleton shaped like the standard admin table (see Orders/Products
 *  lists) — `columns` controls how many bars render per row. */
export default function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="animate-pulse divide-y divide-stone-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, c) => (
              <div key={c} className="h-3 flex-1 rounded bg-stone-200" style={{ maxWidth: c === 0 ? '40%' : '16%' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
