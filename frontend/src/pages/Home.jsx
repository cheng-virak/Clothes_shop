import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/product/ProductCard.jsx';
import { getProducts } from '../api/productApi.js';
import { mapApiProductToCard } from '../utils/mapProduct.js';
import { useTopLevelCategories } from '../hooks/useCategories.js';

const CATEGORY_BLURB = {
  men: 'Everyday staples, tailored basics.',
  women: 'Dresses, layers, and easy separates.',
  accessories: 'The finishing details.',
};
const DEFAULT_BLURB = 'Shop the collection.';

export default function Home() {
  const [newArrivals, setNewArrivals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { categories } = useTopLevelCategories();

  useEffect(() => {
    let cancelled = false;
    getProducts({ limit: 8 })
      .then((res) => {
        if (!cancelled) setNewArrivals(res.data.map(mapApiProductToCard));
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
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            Clothing that fits your life
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-stone-600">
            Considered basics and easy staples for men, women, and everyday carry —
            built to last, priced to actually wear.
          </p>
          <Link
            to="/products"
            className="mt-8 inline-block rounded-lg bg-stone-900 px-8 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-stone-700"
          >
            Shop All Products
          </Link>
        </div>
      </section>

      {/* Category entry points */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-semibold text-stone-900">Shop by category</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              to={`/products?category=${cat.slug}`}
              className="group relative flex h-48 flex-col items-start justify-end overflow-hidden rounded-xl bg-stone-900 p-6 text-white transition hover:opacity-90"
            >
              <span className="text-lg font-semibold">{cat.label}</span>
              <span className="mt-1 text-sm text-stone-300">{CATEGORY_BLURB[cat.slug] ?? DEFAULT_BLURB}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* New arrivals */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-stone-900">New Arrivals</h2>
          <Link to="/products" className="text-sm font-medium text-stone-600 underline hover:text-stone-900">
            View all
          </Link>
        </div>

        {isLoading && <p className="py-12 text-center text-sm text-stone-500">Loading…</p>}
        {!isLoading && error && <p className="py-12 text-center text-sm text-red-600">{error}</p>}
        {!isLoading && !error && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
