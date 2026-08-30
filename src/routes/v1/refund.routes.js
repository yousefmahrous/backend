import express from 'express';
import * as refundService from '../../modules/refund/refund.service.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', doubleCsrfProtection, async (req, res) => {
  const { order_id, reason } = req.body;
  const orderId = parseInt(order_id);

  if (Number.isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'رقم الأوردر غير صالح' });
  }

  const { status, ...response } = await refundService.requestRefund(orderId, req.user.id, reason);
  res.status(status).json(response);
});

router.get('/mine', async (req, res) => {
  const { status, ...response } = await refundService.getMyRefundRequests(req.user.id);
  res.status(status).json(response);
});

router.get('/admin/all', requireAdmin, async (req, res) => {
  const { page, limit, status: requestStatus } = req.query;
  const { status, ...response } = await refundService.getAllRefundRequestsAdmin(
    page,
    limit,
    requestStatus
  );
  res.status(status).json(response);
});

router.post('/:id/approve', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (Number.isNaN(requestId)) {
    return res.status(400).json({ success: false, message: 'رقم الطلب غير صالح' });
  }
  const { status, ...response } = await refundService.approveRefundRequest(requestId);
  res.status(status).json(response);
});

router.post('/:id/reject', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (Number.isNaN(requestId)) {
    return res.status(400).json({ success: false, message: 'رقم الطلب غير صالح' });
  }
  const { status, ...response } = await refundService.rejectRefundRequest(
    requestId,
    req.body.admin_note
  );
  res.status(status).json(response);
});

router.post('/:id/cancel', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (Number.isNaN(requestId)) {
    return res.status(400).json({ success: false, message: 'رقم الطلب غير صالح' });
  }
  const { status, ...response } = await refundService.cancelAwaitingReturn(
    requestId,
    req.body.admin_note
  );
  res.status(status).json(response);
});

router.post('/:id/complete', requireAdmin, doubleCsrfProtection, async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (Number.isNaN(requestId)) {
    return res.status(400).json({ success: false, message: 'رقم الطلب غير صالح' });
  }
  const { status, ...response } = await refundService.completeRefund(requestId);
  res.status(status).json(response);
});

export default router;