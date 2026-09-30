import express from 'express';
import * as vendorService from '../../modules/vendor/vendor.service.js';
import {
  createVendorApplicationSchema,
  updateVendorStatusSchema
} from '../../modules/vendor/vendor.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';
import requireVendor from '../../core/middlewares/requireVendor.middleware.js';
import * as vendorBookService from '../../modules/vendor/vendor.book.service.js';
import { validateAdd, validateEdit } from '../../core/middlewares/validation.js';

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

router.get('/books', requireVendor, async (req, res) => {
  const { page, limit } = req.query;
  const { status, ...response } = await vendorBookService.getMyBooks(req.t, req.vendor.id, page, limit);
  res.status(status).json(response);
});

router.post('/books', requireVendor, doubleCsrfProtection, validateAdd, async (req, res) => {
  const { status, ...response } = await vendorBookService.addMyBook(req.t, req.vendor.id, req.body);
  res.status(status).json(response);
});

router.get('/books/:id', requireVendor, async (req, res) => {
  const { status, ...response } = await vendorBookService.getMyBookById(req.t, req.vendor.id, req.params.id);
  res.status(status).json(response);
});

router.put('/books/:id', requireVendor, doubleCsrfProtection, validateEdit, async (req, res) => {
  const { status, ...response } = await vendorBookService.editMyBook(req.t, req.vendor.id, req.params.id, req.body);
  res.status(status).json(response);
});

router.delete('/books/:id', requireVendor, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await vendorBookService.deleteMyBook(req.t, req.vendor.id, req.params.id);
  res.status(status).json(response);
});

export default router;