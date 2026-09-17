import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineAdjustments } from 'react-icons/hi';
import ProductCard from '../../components/product/ProductCard.jsx';
import ProductCardSkeleton from '../../components/product/ProductCardSkeleton.jsx';
import FilterSidebar from '../../components/product/FilterSidebar.jsx';
import FilterDrawer from '../../components/product/FilterDrawer.jsx';
import Pagination from '../../components/product/Pagination.jsx';
import { getProducts } from '../../api/productApi.js';
import { mapApiProductToCard } from '../../utils/mapProduct.js';
import { useCategories } from '../../hooks/useCategories.js';

const PRICE_BOUNDS = [0, 300];
// Small on purpose — the current seed data is only 11 products, and a
// bigger page size would never actually exercise pagination controls.
const PRODUCTS_PER_PAGE = 8;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A to Z' },
];

export default function ProductList() {
  // Every filter, the sort, and the page all live in the URL — a filtered/
  // sorted/paged view can be bookmarked, shared, and restored with the
  // browser back button, all for free via useSearchParams.
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const location = useLocation();
  const { categories } = useCategories();

  const filters = useMemo(() => {
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    return {
      category: searchParams.get('category') || undefined,
      search: searchParams.get('search') || undefined,
      size: searchParams.get('size') || undefined,
      color: searchParams.get('color') || undefined,
      inStock: searchParams.get('inStock') === 'true' || undefined,
      sort: searchParams.get('sort') || 'newest',
      page: Number(searchParams.get('page')) || 1,
      priceRange:
        minPrice || maxPrice
          ? [minPrice ? Number(minPrice) : PRICE_BOUNDS[0], maxPrice ? Number(maxPrice) : PRICE_BOUNDS[1]]
          : undefined,
    };
  }, [searchParams]);

  // Category is excluded — it's driven by the page heading/nav, not the
  // filter panel, so it shouldn't inflate the "Filters" button's badge.
  const activeFilterCount = [filters.size, filters.color, filters.inStock, filters.priceRange].filter(
    Boolean
  ).length;

  /** Rewrites the URL from a filters-shaped object; resets to page 1 unless told otherwise. */
  const applyFilters = (next, { resetPage = true } = {}) => {
    const params = new URLSearchParams();
    if (next.category) params.set('category', next.category);
    if (next.search) params.set('search', next.search);
    if (next.size) params.set('size', next.size);
    if (next.color) params.set('color', next.color);
    if (next.inStock) params.set('inStock', 'true');
    if (next.sort && next.sort !== 'newest') params.set('sort', next.sort);
    if (next.priceRange) {
      if (next.priceRange[0] > PRICE_BOUNDS[0]) params.set('minPrice', next.priceRange[0]);
      if (next.priceRange[1] < PRICE_BOUNDS[1]) params.set('maxPrice', next.priceRange[1]);
    }
    const page = resetPage ? 1 : next.page ?? filters.page;
    if (page > 1) params.set('page', page);
    setSearchParams(params);
  };

  // FilterSidebar already merges each individual change against the current
  // filters before calling this (see its `setFilter` helper) — EXCEPT for
  // "Clear all filters", which deliberately calls this with `{}` to mean
  // "nothing selected". Re-merging against the old `filters` here would
  // silently undo that clear, so `next` is trusted as the complete state.
  const handleFiltersChange = (next) => applyFilters(next);
  const handleSortChange = (sort) => applyFilters({ ...filters, sort });
  const handlePageChange = (page) => {
    applyFilters({ ...filters, page }, { resetPage: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // A redirect (e.g. checkout opened with an empty cart) can hand us a
  // one-off notice via router state; surface it once, then drop it so
  // navigating back here later doesn't re-show a stale toast.
  useEffect(() => {
    if (location.state?.notice) {
      toast(location.state.notice);
      window.history.replaceState({}, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryParams = useMemo(
    () => ({
      category: filters.category,
      search: filters.search,
      size: filters.size,
      color: filters.color,
      inStock: filters.inStock ? 'true' : undefined,
      sort: filters.sort,
      minPrice: filters.priceRange?.[0],
      maxPrice: filters.priceRange?.[1],
      page: filters.page,
      limit: PRODUCTS_PER_PAGE,
    }),
    [filters]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getProducts(queryParams)
      .then((res) => {
        if (cancelled) return;
        setProducts(res.data.map(mapApiProductToCard));
        setPagination(res.pagination);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  const heading = filters.search
    ? `Search results for "${filters.search}"`
    : categories.find((c) => c.slug === filters.category)?.name ?? 'All Products';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold text-stone-900">{heading}</h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFilterDrawerOpen(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:border-stone-900 sm:hidden"
          >
            <HiOutlineAdjustments size={18} />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-stone-900 px-1 text-[11px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <label className="flex min-h-11 items-center gap-2 text-sm text-stone-600">
            Sort by
            <select
              value={filters.sort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="min-h-11 rounded-md border border-stone-300 py-1.5 pl-2 pr-8 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="hidden sm:block">
          <FilterSidebar filters={filters} onChange={handleFiltersChange} priceBounds={PRICE_BOUNDS} />
        </div>

        <FilterDrawer
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          resultCount={pagination.total}
        >
          <FilterSidebar filters={filters} onChange={handleFiltersChange} priceBounds={PRICE_BOUNDS} />
        </FilterDrawer>

        <div className="flex-1">
          {!isLoading && !error && (
            <p className="mb-4 text-sm text-stone-500" aria-live="polite">
              {pagination.total === 0
                ? '0 products'
                : `${products.length} of ${pagination.total} product${pagination.total === 1 ? '' : 's'}`}
            </p>
          )}

          {isLoading && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: PRODUCTS_PER_PAGE }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="py-16 text-center text-sm">
              <p className="text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams(searchParams))}
                className="mt-3 font-medium text-stone-700 underline hover:text-stone-900"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && products.length === 0 && (
            <div className="py-16 text-center text-sm text-stone-500">
              <p>
                {filters.search
                  ? `No products match "${filters.search}".`
                  : 'No products match these filters.'}
              </p>
              <button
                type="button"
                onClick={() => handleFiltersChange({})}
                className="mt-3 font-medium text-stone-700 underline hover:text-stone-900"
              >
                Clear all filters
              </button>
            </div>
          )}

          {!isLoading && !error && products.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination
                page={filters.page}
                totalPages={pagination.totalPages}
                onChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
