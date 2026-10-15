import express from 'express';
import * as productService from '../../modules/product/product.service.js';
import { validateAdd, validateEdit, validateVariant } from '../../core/middlewares/validation.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import optionalAuth from '../../core/middlewares/optionalAuth.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { page, limit, search, category } = req.query;
  const safeCategory = typeof category === 'string' ? category : '';
  const { status, ...response } = await productService.getAllProducts(req.t, page, limit, search, safeCategory);
  res.status(status).json(response);
});

router.post('/', authMiddleware, requireAdmin, doubleCsrfProtection, validateAdd, async (req, res) => {
  const { status, ...response } = await productService.addProduct(req.t, req.body);
  res.status(status).json(response);
});

router.get('/popular', async (req, res) => {
  const { limit } = req.query;
  const { status, ...response } = await productService.getPopularProducts(req.t, limit);
  res.status(status).json(response);
});

router.get('/:id', optionalAuth, async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const { status, ...response } = await productService.getProductById(req.t, req.params.id, isAdmin);
  res.status(status).json(response);
});

router.delete('/:id', authMiddleware, requireAdmin, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await productService.deleteProduct(req.t, req.params.id);
  res.status(status).json(response);
});

router.post('/:id/variants', authMiddleware, requireAdmin, doubleCsrfProtection, validateVariant, async (req, res) => {
  const { status, ...response } = await productService.addProductVariant(req.t, req.params.id, req.body);
  res.status(status).json(response);
});

router.put('/:id/variants/:variantId', authMiddleware, requireAdmin, doubleCsrfProtection, validateVariant, async (req, res) => {
  const { status, ...response } = await productService.editProductVariant(req.t, req.params.id, req.params.variantId, req.body);
  res.status(status).json(response);
});

router.delete('/:id/variants/:variantId', authMiddleware, requireAdmin, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await productService.removeProductVariant(req.t, req.params.id, req.params.variantId);
  res.status(status).json(response);
});

router.put('/:id', authMiddleware, requireAdmin, doubleCsrfProtection, validateEdit, async (req, res) => {
  const { status, ...response } = await productService.editProduct(req.t, req.params.id, req.body);
  res.status(status).json(response);
});

export default router;