/**
 * Generic zod validation middleware. Pass a schema shaped like
 * { body?, query?, params? } and it validates + replaces req.<part>
 * with the parsed (and coerced/defaulted) value. Throws ZodError on
 * failure, caught by error.middleware.js.
 */
export const validate = (schema) => (req, res, next) => {
  if (schema.body) req.body = schema.body.parse(req.body);
  if (schema.query) req.query = schema.query.parse(req.query);
  if (schema.params) req.params = schema.params.parse(req.params);
  next();
};
