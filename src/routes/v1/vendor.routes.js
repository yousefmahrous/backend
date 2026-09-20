import express from 'express';
import * as vendorService from '../../modules/vendor/vendor.service.js';
import {
  createVendorApplicationSchema,
  updateVendorStatusSchema
} from '../../modules/vendor/vendor.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/apply', doubleCsrfProtection, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ success: false, message: req.t('vendor.adminCannotApply') });
  }

  const result = createVendorApplicationSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await vendorService.applyAsVendor(
    req.t,
    req.user.id,
    result.data.store_name
  );
  res.status(status).json(response);
});

router.get('/me', async (req, res) => {
  const { status, ...response } = await vendorService.getMyVendor(req.t, req.user.id);
  res.status(status).json(response);
});

router.get('/admin/all', requireAdmin, async (req, res) => {
  const { page, limit, status: vendorStatus } = req.query;
  const { status, ...response } = await vendorService.getAllVendorsAdmin(
    req.t,
    page,
    limit,
    vendorStatus
  );
  res.status(status).json(response);
});

router.patch('/:id/status', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const vendorId = parseInt(req.params.id);
  if (Number.isNaN(vendorId)) {
    return res.status(400).json({ success: false, message: req.t('vendor.invalidId') });
  }

  const result = updateVendorStatusSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await vendorService.changeVendorStatus(
    req.t,
    vendorId,
    result.data.status
  );
  res.status(status).json(response);
});

export default router;