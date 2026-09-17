import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTopLevelCategories } from '../hooks/useCategories.js';

/** Rendered for any URL that doesn't match a known route. */
export default function NotFound() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { categories } = useTopLevelCategories();

  const handleSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold text-stone-900">404</h1>
      <p className="mt-2 text-sm text-stone-500">This page doesn't exist.</p>

      <form onSubmit={handleSearch} className="mx-auto mt-6 flex max-w-xs gap-2">
        <label htmlFor="notfound-search" className="sr-only">
          Search products
        </label>
        <input
          id="notfound-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-full border border-stone-300 px-4 py-2 text-sm focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
        >
          Search
        </button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <Link to="/" className="font-medium text-stone-700 underline hover:text-stone-900">
          Home
        </Link>
        <Link to="/products" className="font-medium text-stone-700 underline hover:text-stone-900">
          All Products
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            to={`/products?category=${cat.slug}`}
            className="font-medium text-stone-700 underline hover:text-stone-900"
          >
            {cat.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
