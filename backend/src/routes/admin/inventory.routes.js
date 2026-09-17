import { Router } from 'express';
import { listInventory, previewImport, applyImport } from '../../controllers/admin/inventory.controller.js';
import { verifyToken, isStaffOrAdmin } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { listInventorySchema, inventoryImportSchema } from '../../validators/admin/inventory.validator.js';

const router = Router();

router.use(verifyToken, isStaffOrAdmin); // inventory: staff or admin, per the role spec

router.get('/', validate(listInventorySchema), listInventory);
router.post('/import/preview', validate(inventoryImportSchema), previewImport);
router.post('/import/apply', validate(inventoryImportSchema), applyImport);

export default router;
