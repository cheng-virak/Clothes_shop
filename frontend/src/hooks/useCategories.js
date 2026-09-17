import { useEffect, useState } from 'react';
import { getCategories } from '../api/categoriesApi.js';

// Module-level cache: categories rarely change and several components on
// the same page (Footer + FilterSidebar + Home, etc.) all want the same
// list — without this, a single page load would fire the request once per
// component instead of once total. Resets only on a full page reload.
let cachedPromise = null;
function fetchCategoriesOnce() {
  if (!cachedPromise) {
    cachedPromise = getCategories()
      .then((res) => res.data)
      .catch((err) => {
        cachedPromise = null; // let the next mount retry instead of caching a failure forever
        throw err;
      });
  }
  return cachedPromise;
}

/** Full flat list — { id, name, slug, parent_id, parent_slug }. */
export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCategoriesOnce()
      .then((data) => {
        if (!cancelled) setCategories(data);
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

  return { categories, isLoading, error };
}

/** Top-level categories only ({ label, slug }) — what the storefront nav,
 *  footer, home tiles, and 404 quick-links have always shown. */
export function useTopLevelCategories() {
  const { categories, isLoading, error } = useCategories();
  const topLevel = categories
    .filter((c) => c.parent_id === null)
    .map((c) => ({ label: c.name, slug: c.slug }));
  return { categories: topLevel, isLoading, error };
}
