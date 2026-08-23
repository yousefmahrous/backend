import express from 'express';
import * as orderService from '../../modules/order/order.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { status, ...response } = await orderService.getOrdersForUser(req.user.id);
  res.status(status).json(response);
});

router.get('/latest', async (req, res) => {
  const { status, ...response } = await orderService.getLatestOrderForUser(req.user.id);
  res.status(status).json(response);
});

router.get('/:id', async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (Number.isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'رقم الأوردر غير صالح' });
  }
  const { status, ...response } = await orderService.getOrderForUser(orderId, req.user.id);
  res.status(status).json(response);
});

export default router;