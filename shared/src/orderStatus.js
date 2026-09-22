/**
 * Mirrors the CURRENT `orders.order_status` CHECK constraint in
 * backend/migrations/001_init.sql exactly:
 *   CHECK (order_status IN ('pending','confirmed','processing',
 *                           'shipped','delivered','cancelled'))
 *
 * Note: this is deliberately NOT the richer pending→paid→shipped→refunded
 * state machine discussed for a future iteration — 'paid'/'refunded'
 * aren't values this column can hold today, and adding them is a schema
 * migration that hasn't been requested/approved. When it is, this file is
 * the one place to update, and both apps pick up the change automatically.
 */
export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function isValidOrderStatus(status) {
  return ORDER_STATUSES.includes(status);
}

/**
 * The state machine. Legal transitions only — anything not listed here is
 * illegal and must be rejected with 409. Reasoning for this specific
 * graph (not explicitly dictated, so documented rather than silently
 * assumed): cancellation is only offered before an order ships, matching
 * common practice — once physically shipped, "cancel" doesn't undo the
 * fact that a package is in transit, so shipped only moves forward to
 * delivered. There is no 'refunded' terminal state because the schema
 * has no such value yet (see note above).
 *
 * STOCK_RESTORING_TRANSITIONS: transitioning INTO 'cancelled' from any of
 * these origin statuses restores the stock that order consumed, inside
 * the same transaction as the status write, and is idempotent (checked
 * by verifying the order isn't ALREADY cancelled before restoring, so a
 * double-click / retried request can't restock twice).
 */
export const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export const STOCK_RESTORING_TRANSITIONS = {
  cancelled: ['pending', 'confirmed', 'processing'],
};

export function isLegalOrderTransition(from, to) {
  return Boolean(ORDER_STATUS_TRANSITIONS[from]?.includes(to));
}
