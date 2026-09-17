import { Router } from 'express';
import ordersRoutes from './orders.routes.js';
import productsRoutes from './products.routes.js';
import inventoryRoutes from './inventory.routes.js';
import categoriesRoutes from './categories.routes.js';

// Sub-routers each apply their own verifyToken + isAdmin/isStaffOrAdmin —
// intentionally not hoisted to one shared middleware here, since
// different sections need different role tiers (orders/inventory: staff
// or admin; products/categories: admin only). Not yet built: stats,
// settings, customers, audit-logs, reviews, coupons — the admin app's
// sidebar shows an honest "Not built yet" placeholder for each of those,
// not a broken link. Blog was dropped entirely (not just deferred) —
// see migrations README's note on migration 009's down script.
const router = Router();

router.use('/orders', ordersRoutes);
router.use('/products', productsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/categories', categoriesRoutes);

export default router;
