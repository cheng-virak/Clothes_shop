import { Router } from 'express';
import { listOrders, getOrder, updateOrderStatus } from '../../controllers/admin/orders.controller.js';
import { verifyToken, isStaffOrAdmin } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  listAdminOrdersSchema,
  orderIdParamSchema,
  updateOrderStatusSchema,
} from '../../validators/admin/orders.validator.js';

const router = Router();

router.use(verifyToken, isStaffOrAdmin); // orders: staff or admin, per the role spec

router.get('/', validate(listAdminOrdersSchema), listOrders);
router.get('/:id', validate(orderIdParamSchema), getOrder);
router.patch('/:id/status', validate(updateOrderStatusSchema), updateOrderStatus);

export default router;
