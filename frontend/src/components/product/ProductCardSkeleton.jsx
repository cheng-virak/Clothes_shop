/** Matches ProductCard's layout so the grid doesn't jump when real data
 *  arrives — including its two different shapes: the slim phone card
 *  (shorter image, title, price, colour dots) and the full sm:+ card
 *  (taller image, title/price row, swatches, size chips, Add to Cart). */
export default function ProductCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/5] rounded-xl bg-stone-200 sm:aspect-[3/4]" />

      <div className="mt-2 flex flex-col gap-1 sm:mt-3 sm:gap-1.5">
        {/* Phone: title lines + price stacked underneath, then colour dots. */}
        <div className="sm:hidden">
          <div className="h-3 w-4/5 rounded bg-stone-200" />
          <div className="mt-1 h-3 w-10 rounded bg-stone-200" />
        </div>
        <div className="flex gap-1 sm:hidden">
          <div className="h-2.5 w-2.5 rounded-full bg-stone-200" />
          <div className="h-2.5 w-2.5 rounded-full bg-stone-200" />
        </div>

        {/* sm: and up — unchanged from the original skeleton. */}
        <div className="hidden items-start justify-between gap-2 sm:flex">
          <div className="h-4 w-2/3 rounded bg-stone-200" />
          <div className="h-4 w-10 rounded bg-stone-200" />
        </div>
        <div className="hidden sm:flex sm:flex-col sm:gap-1.5">
          <div className="flex gap-0">
            <div className="h-11 w-11 rounded-full bg-stone-200" />
            <div className="h-11 w-11 rounded-full bg-stone-200" />
          </div>
          <div className="flex gap-1.5">
            <div className="h-11 w-11 rounded-md bg-stone-200" />
            <div className="h-11 w-11 rounded-md bg-stone-200" />
            <div className="h-11 w-11 rounded-md bg-stone-200" />
          </div>
          <div className="mt-1 h-8 w-full rounded-lg bg-stone-200" />
        </div>
      </div>
    </div>
  );
}
