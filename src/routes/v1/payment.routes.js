import express from 'express';
import * as paymentService from '../../modules/payment/payment.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/checkout', async (req, res) => {
  const { status, ...response } = await paymentService.createCheckoutSession(req.user.id);
  res.status(status).json(response);
});

export default router;