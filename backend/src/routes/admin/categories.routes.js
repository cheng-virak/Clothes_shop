import { Router } from 'express';
import {
  listCategories,
  checkSlug,
  createCategory,
  updateCategory,
  reorderCategory,
  deleteCategory,
} from '../../controllers/admin/categories.controller.js';
import { verifyToken, isAdmin } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  categoryIdParamSchema,
  checkSlugSchema,
  createCategorySchema,
  updateCategorySchema,
  reorderCategorySchema,
} from '../../validators/admin/categories.validator.js';

const router = Router();

router.use(verifyToken, isAdmin); // categories: admin only, per the role spec

router.get('/', listCategories);
router.get('/check-slug', validate(checkSlugSchema), checkSlug);
router.post('/', validate(createCategorySchema), createCategory);
router.patch('/:id', validate(updateCategorySchema), updateCategory);
router.patch('/:id/reorder', validate(reorderCategorySchema), reorderCategory);
router.delete('/:id', validate(categoryIdParamSchema), deleteCategory);

export default router;
