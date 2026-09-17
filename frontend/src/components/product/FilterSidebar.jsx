import { useEffect, useState } from 'react';
import clsx from 'clsx';
import PriceRangeSlider from './PriceRangeSlider.jsx';
import { useTopLevelCategories } from '../../hooks/useCategories.js';
import { getProductColors } from '../../api/productApi.js';

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/**
 * Controlled filter panel. `filters` mirrors the backend's GET /api/products
 * query contract — { category, size, color, inStock, priceRange: [min, max] }
 * — so the parent page can pass this object straight through as query params.
 * Category/size/color are single-select, matching the backend's current
 * single-value filters (not an IN-list of multiple values).
 */
export default function FilterSidebar({ filters, onChange, priceBounds = [0, 500] }) {
  const [colors, setColors] = useState([]);
  const { categories } = useTopLevelCategories();
  const setFilter = (patch) => onChange({ ...filters, ...patch });

  useEffect(() => {
    let cancelled = false;
    getProductColors()
      .then((res) => {
        if (!cancelled) setColors(res.data);
      })
      .catch(() => {
        // Non-critical — the color filter just won't render if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasActiveFilters =
    filters.category || filters.size || filters.color || filters.inStock || filters.priceRange;

  return (
    <aside className="w-full shrink-0 space-y-8 lg:w-56">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-stone-900">Category</h3>
        <ul className="space-y-1.5">
          <li>
            <button
              type="button"
              aria-pressed={!filters.category}
              onClick={() => setFilter({ category: undefined })}
              className={clsx(
                'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition',
                !filters.category
                  ? 'bg-stone-900 font-medium text-white'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              )}
            >
              All Products
            </button>
          </li>
          {categories.map((cat) => {
            const isSelected = filters.category === cat.slug;
            return (
              <li key={cat.slug}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setFilter({ category: isSelected ? undefined : cat.slug })}
                  className={clsx(
                    'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition',
                    isSelected
                      ? 'bg-stone-900 font-medium text-white'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  )}
                >
                  {cat.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-stone-900">Size</h3>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((size) => {
            const isSelected = filters.size === size;
            return (
              <button
                key={size}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setFilter({ size: isSelected ? undefined : size })}
                className={clsx(
                  'flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 text-xs font-medium transition',
                  isSelected
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 text-stone-700 hover:border-stone-900'
                )}
              >
                {size}
              </button>
            );
          })}
        </div>
      </div>

      {colors.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-stone-900">Color</h3>
          <div className="flex flex-wrap gap-0">
            {colors.map((color) => {
              const isSelected = filters.color === color.name;
              return (
                <button
                  key={color.name}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={color.name}
                  title={color.name}
                  onClick={() => setFilter({ color: isSelected ? undefined : color.name })}
                  className="group flex h-11 w-11 shrink-0 items-center justify-center"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'h-7 w-7 rounded-full ring-offset-2 transition',
                      isSelected ? 'ring-2 ring-stone-900' : 'ring-1 ring-stone-300 group-hover:ring-stone-500'
                    )}
                    style={{ backgroundColor: color.hex || '#d6d3d1' }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-stone-900">Price</h3>
        <PriceRangeSlider
          min={priceBounds[0]}
          max={priceBounds[1]}
          value={filters.priceRange ?? priceBounds}
          onChange={(priceRange) => setFilter({ priceRange })}
        />
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={Boolean(filters.inStock)}
          onChange={(e) => setFilter({ inStock: e.target.checked || undefined })}
          className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
        />
        In stock only
      </label>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs font-medium text-stone-500 underline hover:text-stone-900"
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}
