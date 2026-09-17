import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineTrash } from 'react-icons/hi';
import { uploadProductImage, deleteProductImage, setPrimaryProductImage } from '../../api/adminApi.js';

/**
 * Image management, now a tab inside the product editor rather than its
 * own top-level page (previously /products/:id/images). Delete/set-primary
 * were already real; this pass adds upload progress. Drag-and-drop
 * reordering, alt text, and stored dimensions are NOT done — those need a
 * DB migration (product_images has no alt_text/width/height reorder
 * column beyond sort_order isn't writable via any endpoint yet) and a new
 * `image-size` dependency, which per the project's rule of never silently
 * touching the schema or adding a dependency, are flagged for the user
 * rather than added here.
 */
export default function ProductImagesTab({ productId, images, onChanged }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    try {
      await uploadProductImage(productId, file, (progress) => setUploadProgress(progress));
      toast.success('Image uploaded');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (imageId) => {
    try {
      await deleteProductImage(productId, imageId);
      toast.success('Image removed');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSetPrimary = async (imageId) => {
    try {
      await setPrimaryProductImage(productId, imageId);
      toast.success('Set as primary image');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      {images.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {images.map((image) => (
            <div key={image.id} className="group relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
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

      {images.length === 0 && (
        <p className="mb-6 text-sm text-stone-500">No images yet — this product shows a placeholder on the storefront.</p>
      )}

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-stone-700">Upload a new image</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={isUploading}
          className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-white hover:file:bg-stone-700 disabled:opacity-60"
        />
      </label>
      {isUploading && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-stone-900 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <p className="mt-1 text-xs text-stone-500">Uploading… {uploadProgress}%</p>
        </div>
      )}
    </div>
  );
}
