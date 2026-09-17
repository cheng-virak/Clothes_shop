import { Router } from 'express';
import {
  listAdminProducts,
  getAdminProduct,
  updateProduct,
  updateVariant,
  updateProductStatus,
  deleteProduct,
} from '../../controllers/admin/products.controller.js';
import { verifyToken, isAdmin } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  listAdminProductsSchema,
  productIdParamSchema,
  updateProductSchema,
  updateVariantSchema,
  updateProductStatusSchema,
} from '../../validators/admin/products.validator.js';

const router = Router();

router.use(verifyToken, isAdmin); // products: admin only, per the role spec

router.get('/', validate(listAdminProductsSchema), listAdminProducts);
router.get('/:id', validate(productIdParamSchema), getAdminProduct);
router.patch('/:id', validate(updateProductSchema), updateProduct);
router.patch('/:id/variants/:variantId', validate(updateVariantSchema), updateVariant);
router.patch('/:id/status', validate(updateProductStatusSchema), updateProductStatus);
router.delete('/:id', validate(productIdParamSchema), deleteProduct);

export default router;
