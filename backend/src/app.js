import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { UPLOADS_DIR } from './middlewares/upload.middleware.js';
import { ApiError } from './utils/ApiError.js';
import { connectMongo } from './config/mongo.js';

const app = express();

// On serverless hosts (Vercel) this module is the entrypoint and server.js
// never runs, so make sure MongoDB is connected before any route runs.
// Locally it's a no-op: server.js has already connected.
app.use((req, res, next) => {
  connectMongo().then(() => next(), next);
});

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

// Uploaded product images. Reached through the frontend's dev proxy (see
// vite.config.js) so the browser only ever requests same-origin, keeping
// this behind the same helmet/CORS posture as everything else.
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
