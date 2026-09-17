import { Router } from 'express';
import {
  getProducts,
  suggestProducts,
  getProductColors,
  getProduct,
  createProduct,
  addProductImage,
  deleteProductImage,
  setPrimaryProductImage,
} from '../controllers/product.controller.js';
import { verifyToken, isAdmin } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { uploadProductImage } from '../middlewares/upload.middleware.js';
import {
  listProductsSchema,
  suggestProductsSchema,
  productIdentifierParamSchema,
  productIdParamSchema,
  productImageParamSchema,
  createProductSchema,
} from '../validators/product.validator.js';

const router = Router();

router.get('/', validate(listProductsSchema), getProducts);
router.get('/suggest', validate(suggestProductsSchema), suggestProducts); // before :identifier — see note below
router.get('/colors', getProductColors); // before :identifier — see note below
router.post('/', verifyToken, isAdmin, validate(createProductSchema), createProduct);

router.post(
  '/:id/images',
  verifyToken,
  isAdmin,
  validate(productIdParamSchema),
  uploadProductImage,
  addProductImage
);
router.delete(
  '/:id/images/:imageId',
  verifyToken,
  isAdmin,
  validate(productImageParamSchema),
  deleteProductImage
);
router.patch(
  '/:id/images/:imageId/primary',
  verifyToken,
  isAdmin,
  validate(productImageParamSchema),
  setPrimaryProductImage
);

// Kept last: :identifier is a single-segment catch-all (numeric id or
// slug) and would otherwise need careful ordering against the routes
// above — it's harmless here since those all have more path segments,
// but this keeps the "most specific first" convention explicit.
router.get('/:identifier', validate(productIdentifierParamSchema), getProduct);

export default router;
