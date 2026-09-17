// The real implementation lives in shared/src/format.js — both the
// storefront and admin apps must format currency identically, so this
// is a thin re-export, not a second copy of the logic.
export { formatCurrency } from '@shope/shared/format';
