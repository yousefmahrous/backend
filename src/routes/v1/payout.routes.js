import express from 'express';
import * as payoutService from '../../modules/payout/payout.service.js';
import { createPayoutSchema } from '../../modules/payout/payout.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/admin/balances', async (req, res) => {
  const { status, ...response } = await payoutService.getVendorBalances(req.t);
  res.status(status).json(response);
});

router.get('/admin/all', async (req, res) => {
  const { page, limit } = req.query;
  const { status, ...response } = await payoutService.getAllPayoutsAdmin(req.t, page, limit);
  res.status(status).json(response);
});

router.post('/admin/vendors/:vendorId', doubleCsrfProtection, async (req, res) => {
  const vendorId = parseInt(req.params.vendorId);
  if (Number.isNaN(vendorId)) {
    return res.status(400).json({ success: false, message: req.t('payout.invalidId') });
  }

  const result = createPayoutSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await payoutService.recordPayout(req.t, req.user.id, vendorId, result.data);
  res.status(status).json(response);
});

export default router;