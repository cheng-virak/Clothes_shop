import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from '../controllers/cart.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  addToCartSchema,
  updateCartItemSchema,
  cartItemParamSchema,
} from '../validators/cart.validator.js';

const router = Router();

router.use(verifyToken); // every cart route is per-user

router.get('/', getCart);
router.post('/', validate(addToCartSchema), addToCart);
router.patch('/:variantId', validate(updateCartItemSchema), updateCartItem);
router.delete('/:variantId', validate(cartItemParamSchema), removeCartItem);
router.delete('/', clearCart);

export default router;
