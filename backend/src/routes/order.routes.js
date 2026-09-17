import { Router } from 'express';
import { createOrder, getMyOrders } from '../controllers/order.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createOrderSchema, myOrdersQuerySchema } from '../validators/order.validator.js';

const router = Router();

router.post('/', verifyToken, validate(createOrderSchema), createOrder);
router.get('/my-orders', verifyToken, validate(myOrdersQuerySchema), getMyOrders);

export default router;
