import express from 'express';
import * as paymentService from '../../modules/payment/payment.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import { checkoutLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/checkout', checkoutLimiter, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await paymentService.createCheckoutSession(req.user.id);
  res.status(status).json(response);
});

export default router;