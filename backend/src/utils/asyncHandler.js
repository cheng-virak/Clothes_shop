/**
 * Wraps an async route/controller so a rejected promise (thrown ApiError,
 * DB error, etc.) is forwarded to next(err) instead of crashing the
 * process or hanging the request. Avoids repeating try/catch everywhere.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
