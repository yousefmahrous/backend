import express from 'express';
import * as cartService from '../../modules/cart/cart.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.use((req, res, next) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ success: false, message: req.t('cart.customersOnly') });
  }
  next();
});

router.get('/', async (req, res) => {
  const { status, ...response } = await cartService.getCart(req.t, req.user.id);
  res.status(status).json(response);
});

router.post('/items', doubleCsrfProtection, async (req, res) => {
  const { product_id, variant_id } = req.body;
  if (!product_id && !variant_id) {
    return res.status(400).json({ success: false, message: req.t('cart.productIdRequired') });
  }
  const productId = product_id ? parseInt(product_id) : undefined;
  const variantId = variant_id ? parseInt(variant_id) : undefined;
  if (Number.isNaN(productId) || Number.isNaN(variantId)) {
    return res.status(400).json({ success: false, message: req.t('cart.productIdRequired') });
  }
  const { status, ...response } = await cartService.addToCart(req.t, req.user.id, productId, variantId);
  res.status(status).json(response);
});

router.patch('/items/:id', doubleCsrfProtection, async (req, res) => {
  const { quantity } = req.body;
  const { status, ...response } = await cartService.updateQuantity(
    req.t,
    req.user.id,
    parseInt(req.params.id),
    parseInt(quantity)
  );
  res.status(status).json(response);
});

router.delete('/items/:id', doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await cartService.removeFromCart(req.t, req.user.id, parseInt(req.params.id));
  res.status(status).json(response);
});

export default router;