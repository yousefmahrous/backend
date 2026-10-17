import express from 'express';
import * as vendorService from '../../modules/vendor/vendor.service.js';
import {
  createVendorApplicationSchema,
  updateVendorStatusSchema,
  updateFulfillmentSchema
} from '../../modules/vendor/vendor.schema.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';
import requireVendor from '../../core/middlewares/requireVendor.middleware.js';
import * as productService from '../../modules/product/product.service.js';
import * as vendorProductService from '../../modules/vendor/vendor.product.service.js';
import * as vendorOrderService from '../../modules/vendor/vendor.order.service.js';
import * as vendorAnalyticsService from '../../modules/vendor/vendor.analytics.service.js';
import * as payoutService from '../../modules/payout/payout.service.js';
import * as refundService from '../../modules/refund/refund.service.js';
import { validateAdd, validateEdit, validateVariant } from '../../core/middlewares/validation.js';

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

router.get('/admin/analytics', requireAdmin, async (req, res) => {
  const { status, ...response } = await vendorAnalyticsService.getAdminAnalytics(req.t, req.query.days);
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

router.get('/products', requireVendor, async (req, res) => {
  const { page, limit } = req.query;
  const { status, ...response } = await vendorProductService.getMyProducts(req.t, req.vendor.id, page, limit);
  res.status(status).json(response);
});

router.post('/products', requireVendor, doubleCsrfProtection, validateAdd, async (req, res) => {
  const { status, ...response } = await vendorProductService.addMyProduct(req.t, req.vendor.id, req.body);
  res.status(status).json(response);
});

router.get('/products/:id', requireVendor, async (req, res) => {
  const { status, ...response } = await vendorProductService.getMyProductById(req.t, req.vendor.id, req.params.id);
  res.status(status).json(response);
});

router.put('/products/:id', requireVendor, doubleCsrfProtection, validateEdit, async (req, res) => {
  const { status, ...response } = await vendorProductService.editMyProduct(req.t, req.vendor.id, req.params.id, req.body);
  res.status(status).json(response);
});

router.delete('/products/:id', requireVendor, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await vendorProductService.deleteMyProduct(req.t, req.vendor.id, req.params.id);
  res.status(status).json(response);
});

router.post('/products/:id/variants', requireVendor, doubleCsrfProtection, validateVariant, async (req, res) => {
  const { status, ...response } = await productService.addProductVariant(req.t, req.params.id, req.body, req.vendor.id);
  res.status(status).json(response);
});

router.put('/products/:id/variants/:variantId', requireVendor, doubleCsrfProtection, validateVariant, async (req, res) => {
  const { status, ...response } = await productService.editProductVariant(req.t, req.params.id, req.params.variantId, req.body, req.vendor.id);
  res.status(status).json(response);
});

router.delete('/products/:id/variants/:variantId', requireVendor, doubleCsrfProtection, async (req, res) => {
  const { status, ...response } = await productService.removeProductVariant(req.t, req.params.id, req.params.variantId, req.vendor.id);
  res.status(status).json(response);
});

router.get('/returns', requireVendor, async (req, res) => {
  const { page, limit } = req.query;
  const { status, ...response } = await refundService.getVendorReturns(req.t, req.lang, req.vendor.id, page, limit);
  res.status(status).json(response);
});

router.get('/analytics', requireVendor, async (req, res) => {
  const { status, ...response } = await vendorAnalyticsService.getVendorAnalytics(
    req.t,
    req.lang,
    req.vendor.id,
    req.query.days
  );
  res.status(status).json(response);
});

router.get('/earnings', requireVendor, async (req, res) => {
  const { status, ...response } = await payoutService.getEarnings(req.t, req.vendor);
  res.status(status).json(response);
});

router.get('/payouts', requireVendor, async (req, res) => {
  const { page, limit } = req.query;
  const { status, ...response } = await payoutService.getMyPayouts(req.t, req.vendor.id, page, limit);
  res.status(status).json(response);
});

router.get('/admin/platform-orders', requireAdmin, async (req, res) => {
  const { page, limit, status: fulfillmentStatus } = req.query;
  const { status, ...response } = await vendorOrderService.getPlatformOrders(
    req.t,
    req.lang,
    page,
    limit,
    fulfillmentStatus
  );
  res.status(status).json(response);
});

router.patch('/admin/platform-orders/:id/fulfillment', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: req.t('order.invalidId') });
  }

  const result = updateFulfillmentSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await vendorOrderService.updatePlatformFulfillment(
    req.t,
    req.lang,
    id,
    result.data
  );
  res.status(status).json(response);
});

router.get('/orders', requireVendor, async (req, res) => {
  const { page, limit, status: fulfillmentStatus } = req.query;
  const { status, ...response } = await vendorOrderService.getMyOrders(
    req.t,
    req.lang,
    req.vendor.id,
    page,
    limit,
    fulfillmentStatus
  );
  res.status(status).json(response);
});

router.get('/orders/:id', requireVendor, async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: req.t('order.invalidId') });
  }

  const { status, ...response } = await vendorOrderService.getMyOrderById(req.t, req.lang, req.vendor.id, id);
  res.status(status).json(response);
});

router.patch('/orders/:id/fulfillment', requireVendor, doubleCsrfProtection, async (req, res) => {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: req.t('order.invalidId') });
  }

  const result = updateFulfillmentSchema(req.t).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });
  }

  const { status, ...response } = await vendorOrderService.updateFulfillment(
    req.t,
    req.lang,
    req.vendor.id,
    id,
    result.data
  );
  res.status(status).json(response);
});

export default router;