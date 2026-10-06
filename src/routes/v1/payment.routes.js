import express from 'express';
import * as paymentService from '../../modules/payment/payment.service.js';
import { shippingAddressSchema } from '../../modules/order/order.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import { checkoutLimiter } from '../../core/middlewares/rateLimiter.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/checkout', checkoutLimiter, doubleCsrfProtection, async (req, res) => {
  const result = shippingAddressSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await paymentService.createCheckoutSession(
    req.t,
    req.lang,
    req.user.id,
    result.data
  );
  res.status(status).json(response);
});

export default router;