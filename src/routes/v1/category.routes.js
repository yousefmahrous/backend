import express from 'express';
import * as categoryService from '../../modules/category/category.service.js';
import { categorySchema } from '../../modules/category/category.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { status, ...response } = await categoryService.getAllCategories(req.t);
  res.status(status).json(response);
});

router.post('/', authMiddleware, requireAdmin, doubleCsrfProtection, async (req, res) => {
  const result = categorySchema(req.t).safeParse(req.body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return res.status(400).json({
      success: false,
      message: Object.values(fieldErrors).flat().join(' - '),
      errors: fieldErrors,
    });
  }
  const { status, ...response } = await categoryService.addCategory(req.t, result.data);
  res.status(status).json(response);
});

router.put('/:id', authMiddleware, requireAdmin, doubleCsrfProtection, async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: req.t('category.notFound') });
  }
  const result = categorySchema(req.t).safeParse(req.body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return res.status(400).json({
      success: false,
      message: Object.values(fieldErrors).flat().join(' - '),
      errors: fieldErrors,
    });
  }
  const { status, ...response } = await categoryService.editCategory(req.t, id, result.data);
  res.status(status).json(response);
});

router.delete('/:id', authMiddleware, requireAdmin, doubleCsrfProtection, async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: req.t('category.notFound') });
  }
  const { status, ...response } = await categoryService.removeCategory(req.t, id);
  res.status(status).json(response);
});

export default router;