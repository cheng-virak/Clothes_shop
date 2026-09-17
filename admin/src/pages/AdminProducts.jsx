import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts } from '../api/productApi.js';
import { formatCurrency } from '@shope/shared/format';

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getProducts({ limit: 50 })
      .then((res) => {
        if (!cancelled) setProducts(res.data);
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
      <h1 className="mb-1 text-2xl font-semibold text-stone-900">Products</h1>
      <p className="mb-6 text-sm text-stone-500">Pick a product to manage its photos.</p>

      {isLoading && <p className="py-16 text-center text-sm text-stone-500">Loading products…</p>}
      {!isLoading && error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}

      {!isLoading && !error && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
          {products.map((product) => (
            <li key={product.id} className="flex items-center gap-4 p-4">
              <img
                src={product.primary_image || 'https://placehold.co/80x100?text=No+Image'}
                alt=""
                className="h-16 w-12 rounded object-cover"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-stone-900">{product.title}</p>
                <p className="text-xs text-stone-500">
                  {formatCurrency(product.base_price)} · {product.category_name}
                </p>
              </div>
              <Link
                to={`/products/${product.id}/images`}
                className="text-sm font-medium text-stone-700 underline hover:text-stone-900"
              >
                Manage images
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
