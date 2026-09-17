import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineTrash } from 'react-icons/hi';
import { getProduct } from '../api/productApi.js';
import { uploadProductImage, deleteProductImage, setPrimaryProductImage } from '../api/adminApi.js';

export default function AdminProductImages() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(() => {
    setIsLoading(true);
    getProduct(id)
      .then((res) => setProduct(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file again later
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadProductImage(id, file);
      toast.success('Image uploaded');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (imageId) => {
    try {
      await deleteProductImage(id, imageId);
      toast.success('Image removed');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSetPrimary = async (imageId) => {
    try {
      await setPrimaryProductImage(id, imageId);
      toast.success('Set as primary image');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <Link to="/products" className="mb-6 inline-block text-sm text-stone-500 hover:text-stone-900">
        ← Back to products
      </Link>

      {isLoading && <p className="py-16 text-center text-sm text-stone-500">Loading…</p>}
      {!isLoading && error && <p className="py-16 text-center text-sm text-red-600">{error}</p>}

      {!isLoading && !error && product && (
        <>
          <h1 className="mb-1 text-2xl font-semibold text-stone-900">{product.title}</h1>
          <p className="mb-6 text-sm text-stone-500">Manage this product's photos.</p>

          {product.images.length > 0 && (
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {product.images.map((image) => (
                <div
                  key={image.id}
                  className="group relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
                >
                  <img src={image.image_url} alt="" className="aspect-[3/4] w-full object-cover" />
                  {image.is_primary ? (
                    <span className="absolute left-2 top-2 rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Primary
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(image.id)}
                      className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-stone-700 opacity-0 transition hover:bg-white group-hover:opacity-100"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(image.id)}
                    aria-label="Delete image"
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-red-600 opacity-0 transition hover:bg-white group-hover:opacity-100"
                  >
                    <HiOutlineTrash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-700">Upload a new image</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              disabled={isUploading}
              className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-white hover:file:bg-stone-700 disabled:opacity-60"
            />
          </label>
          {isUploading && <p className="mt-2 text-xs text-stone-500">Uploading…</p>}
        </>
      )}
    </div>
  );
}
