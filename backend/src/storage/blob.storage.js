import { randomUUID } from 'node:crypto';
import { put, del } from '@vercel/blob';

/**
 * Vercel Blob — the production implementation, used whenever a Blob
 * store is connected (see storage/index.js for the switch).
 *
 * Images end up on Vercel's CDN at an absolute URL, which is what gets
 * stored in product_images.image_url. That is the reason this works on
 * serverless at all: nothing is written to the function's filesystem,
 * and nothing has to be served back through Express — which matters
 * because `express.static()` is explicitly not supported on Vercel.
 */
export async function save({ buffer, extension, contentType }) {
  const { url } = await put(`products/${randomUUID()}${extension}`, buffer, {
    access: 'public',
    contentType,
    // The pathname already carries a uuid, so a second random suffix
    // would only make the URL longer. Overwrites are left disallowed
    // (the default): a uuid collision should fail loudly, not silently
    // replace another product's image.
    addRandomSuffix: false,
  });

  return { url };
}

export async function remove(url) {
  // Rows created before a Blob store existed still hold a local
  // `/uploads/...` path; there is no blob to delete for those.
  if (!url.startsWith('http')) return;
  // del() is a no-op for a URL that is already gone, so a retry or a
  // half-finished earlier delete is not an error worth failing on.
  await del(url).catch(() => {});
}
