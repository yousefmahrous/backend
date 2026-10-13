import express from 'express';
import * as settingsService from '../../modules/settings/settings.service.js';
import {
  updateCommissionSettingsSchema,
  updateVendorCommissionSchema
} from '../../modules/settings/settings.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/admin/commission', async (req, res) => {
  const { status, ...response } = await settingsService.getCommissionSettings(req.t);
  res.status(status).json(response);
});

router.patch('/admin/commission', doubleCsrfProtection, async (req, res) => {
  const result = updateCommissionSettingsSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await settingsService.updateCommissionSettings(req.t, result.data);
  res.status(status).json(response);
});

router.patch('/admin/vendors/:vendorId/commission', doubleCsrfProtection, async (req, res) => {
  const vendorId = parseInt(req.params.vendorId);
  if (Number.isNaN(vendorId)) {
    return res.status(400).json({ success: false, message: req.t('settings.invalidId') });
  }

  const result = updateVendorCommissionSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await settingsService.updateVendorCommission(
    req.t,
    vendorId,
    result.data.commission_bps
  );
  res.status(status).json(response);
});

export default router;