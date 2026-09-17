/**
 * Rendered inside the normal sidebar layout for any section that exists
 * in the nav but doesn't have a real page yet — an honest placeholder,
 * never a blank screen or a broken link. See navItems.js for the full
 * section list; App.jsx routes each unbuilt one here.
 */
export default function NotBuiltYet({ title }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white text-center">
      <h1 className="text-lg font-semibold text-stone-900">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500">
        This section isn't built yet. The route and nav link are real — the screen behind
        them is next.
      </p>
    </div>
  );
}
