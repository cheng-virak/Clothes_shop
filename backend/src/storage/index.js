import { env } from '../config/env.js';
import * as disk from './disk.storage.js';
import * as blob from './blob.storage.js';

/**
 * Where uploaded product images go.
 *
 * Chosen from the environment rather than from NODE_ENV: what decides it
 * is whether a Blob store is actually reachable, and that is exactly
 * what the presence of its credentials tells us. A developer with no
 * Vercel setup at all gets local disk and a working upload button with
 * zero configuration; a Vercel deployment with a Blob store connected
 * gets Blob automatically, because Vercel injects the token itself.
 *
 * Both implementations expose the same pair:
 *   save({ buffer, extension, contentType }) -> { url }
 *   remove(url) -> void
 * and `url` is whatever belongs in product_images.image_url — a
 * site-relative `/uploads/...` path on disk, an absolute CDN URL on
 * Blob. Everything downstream just renders the string, so a row written
 * under one backend still works after switching to the other.
 */
export const storage = env.blob.enabled ? blob : disk;

export const storageBackend = env.blob.enabled ? 'vercel-blob' : 'local-disk';
