import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * backend/uploads — served statically at /uploads by app.js.
 *
 * This backend is the local-development implementation only. It cannot
 * work on Vercel: a function's filesystem is read-only apart from /tmp,
 * and /tmp is per-instance and discarded, so a written file would be
 * invisible to the next request. Production uses blob.storage.js.
 */
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

export async function save({ buffer, extension, contentType }) {
  // Never trust the client-supplied filename — the name is generated
  // here and the extension comes from the (allowlisted) content type, so
  // there is no path traversal or collision risk.
  void contentType;
  const filename = `${randomUUID()}${extension}`;

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

  return { url: `/uploads/${filename}` };
}

export async function remove(url) {
  // Only ever unlink inside the uploads directory, and only a basename —
  // a stored URL should never escape it, and this makes sure it can't.
  if (!url.startsWith('/uploads/')) return;
  await fs.unlink(path.join(UPLOADS_DIR, path.basename(url))).catch(() => {});
}
