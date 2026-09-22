import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

/**
 * Uploads are buffered in memory, not written to disk by multer itself.
 *
 * That's what lets the same middleware serve both storage backends: the
 * controller hands the buffer to `storage.save()`, which either writes
 * it under backend/uploads locally or streams it to Vercel Blob in
 * production (see src/storage/). multer.diskStorage() could only ever do
 * the first, and would fail outright on a serverless host's read-only
 * filesystem.
 *
 * Holding one 5MB image in memory is well within a function's limit; the
 * `files: 1` and `fileSize` limits below are what keep it bounded.
 */
const ALLOWED_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

/**
 * The file extension to store under, derived from the content type
 * rather than from the uploaded filename — the client's filename is
 * never trusted, and the type has already been checked against the
 * allowlist above.
 */
export function extensionFor(mimetype) {
  return ALLOWED_MIME_TYPES.get(mimetype) ?? '';
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new ApiError(400, 'Only JPEG, PNG, WEBP, or GIF images are allowed'));
    return;
  }
  cb(null, true);
}

export const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB
}).single('image');
