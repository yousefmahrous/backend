import express from 'express';
import * as cartService from '../../modules/cart/cart.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { status, ...response } = await cartService.getCart(req.user.id);
  res.status(status).json(response);
});

router.post('/items', async (req, res) => {
  const { book_id } = req.body;
  if (!book_id) {
    return res.status(400).json({ success: false, message: 'book_id مطلوب' });
  }
  const { status, ...response } = await cartService.addToCart(req.user.id, parseInt(book_id));
  res.status(status).json(response);
});

router.patch('/items/:id', async (req, res) => {
  const { quantity } = req.body;
  const { status, ...response } = await cartService.updateQuantity(
    req.user.id,
    parseInt(req.params.id),
    parseInt(quantity)
  );
  res.status(status).json(response);
});

router.delete('/items/:id', async (req, res) => {
  const { status, ...response } = await cartService.removeFromCart(req.user.id, parseInt(req.params.id));
  res.status(status).json(response);
});

export default router;