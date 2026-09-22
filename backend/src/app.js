import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { UPLOADS_DIR } from './storage/disk.storage.js';
import { ApiError } from './utils/ApiError.js';

const app = express();

// No connect-before-first-request middleware is needed, even on a
// serverless host: node-postgres opens a connection lazily on the first
// query and the pool lives for as long as the warm instance does. An
// invocation that never touches the database never opens a connection,
// and no route waits on a handshake that has already happened.

app.use(helmet());
// Explicit allowlist from env.corsOrigins — never a wildcard, even though
// credentials:true would make a wildcard invalid anyway. Two real local
// origins today (storefront :5173, admin :5174); a request from anywhere
// else is rejected by the cors package itself (no Access-Control-* headers
// sent back, so the browser blocks it).
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (curl, server-to-server, same-origin) — allow.
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // ApiError, not a plain Error — errorHandler special-cases ApiError
        // first, so this returns a clean 403 instead of falling through to
        // the generic "Unhandled Error" 500 path (which would also spam
        // the server console for what is an expected, routine rejection).
        callback(ApiError.forbidden(`Origin not allowed: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// Tighter limit on auth routes to slow down brute-force login/registration attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Uploaded product images, for LOCAL DEVELOPMENT only. Reached through
// each client's dev proxy (see their vite.config.js) so the browser only
// ever requests same-origin, keeping this behind the same helmet/CORS
// posture as everything else.
//
// This line does nothing on Vercel — `express.static()` is explicitly
// unsupported there, and the filesystem is read-only anyway. It doesn't
// need to work: with a Blob store connected, images are stored at
// absolute CDN URLs and never routed through Express at all. Left in
// place because it is what makes the local disk backend usable.
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
