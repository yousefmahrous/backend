import stripe from '../../core/config/stripe.config.js';
import * as refundRepo from './refund.repository.js';
import { getIO } from '../../core/config/socket.config.js';
import { addRefundStatusEmailJob, addVendorReturnEmailJob } from '../../core/email.queue.js';
import { pickLocalized } from '../../core/i18n/localized.js';
import logger from '../../core/logger.js';

const RETURN_WINDOW_DAYS = 14;

const emitProductsUpdated = () => {
  try {
    getIO().emit('products_updated');
  } catch (err) {
  }
};

const queueRefundStatusEmail = async (request) => {
  if (request?.user?.email) {
    try {
      await addRefundStatusEmailJob(request.user.email, request.user.name, request, request.user.preferred_lang);
    } catch (err) {
      logger.error({ err: err }, 'فشل جدولة إيميل حالة الاسترجاع');
    }
  }
};

const serializeRequest = (request, lang) => ({
  id: request.id,
  order_id: request.order_id,
  status: request.status,
  reason: request.reason,
  admin_note: request.admin_note,
  created_at: request.created_at,
  reviewed_at: request.reviewed_at,
  refund_amount: request.refund_amount ?? null,
  shipment: request.vendor_order
    ? {
        id: request.vendor_order.id,
        vendor: request.vendor_order.vendor
          ? { id: request.vendor_order.vendor.id, store_name: request.vendor_order.vendor.store_name }
          : null,
        items: (request.vendor_order.items ?? []).map((item) => ({
          product_id: item.product_id,
          title: pickLocalized(item.product?.title, lang),
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      }
    : null,
  order: request.order
    ? {
        id: request.order.id,
        status: request.order.status,
        total_amount: request.order.total_amount,
        currency: request.order.currency,
        paid_at: request.order.paid_at,
        items: request.order.items
          ? request.order.items.map((item) => ({
              product_id: item.product_id,
              title: pickLocalized(item.product?.title, lang),
              quantity: item.quantity,
              unit_price: item.unit_price
            }))
          : undefined
      }
    : undefined,
  user: request.user
    ? { id: request.user.id, name: request.user.name, email: request.user.email }
    : undefined
});

const queueVendorReturnEmail = async (request) => {
  const owner = request?.vendor_order?.vendor?.owner;
  if (!owner?.email) return;
  try {
    await addVendorReturnEmailJob(
      owner.email,
      owner.name,
      {
        order_id: request.order_id,
        store_name: request.vendor_order.vendor.store_name,
        amount: request.refund_amount
      },
      owner.preferred_lang
    );
  } catch (err) {
    logger.error({ err }, 'فشل جدولة إيميل طلب الاسترجاع للبائع');
  }
};

export const requestRefund = async (t, lang, orderId, userId, reason, vendorOrderId) => {
  try {
    if (!reason || !reason.trim()) {
      return { success: false, status: 400, message: t('refund.reasonRequired') };
    }

    const order = await refundRepo.findOrderForRefundRequest(orderId, userId);

    if (!order) {
      return { success: false, status: 404, message: t('refund.orderNotFound') };
    }

    if (order.status !== 'paid') {
      return {
        success: false,
        status: 400,
        message: t('refund.orderNotEligible')
      };
    }

    // Which vendor's shipment is being returned. An order with a single shipment
    // doesn't need the client to say so.
    const shipments = order.vendorOrders ?? [];
    let shipment;
    if (vendorOrderId !== undefined && vendorOrderId !== null) {
      shipment = shipments.find((s) => s.id === vendorOrderId);
      if (!shipment) {
        return { success: false, status: 404, message: t('refund.shipmentNotFound') };
      }
    } else if (shipments.length === 1) {
      shipment = shipments[0];
    } else {
      return { success: false, status: 400, message: t('refund.shipmentRequired') };
    }

    if (shipment.return_status === 'refunded') {
      return { success: false, status: 400, message: t('refund.alreadyRefunded') };
    }

    const activeRequest = await refundRepo.findActiveRefundRequest(orderId, shipment.id);
    if (shipment.return_status || activeRequest) {
      return { success: false, status: 400, message: t('refund.activeRequestExists') };
    }

    if (!order.paid_at) {
      return { success: false, status: 400, message: t('refund.paidAtMissing') };
    }

    const deadline = new Date(order.paid_at);
    deadline.setDate(deadline.getDate() + RETURN_WINDOW_DAYS);

    if (new Date() > deadline) {
      return {
        success: false,
        status: 400,
        message: t('refund.windowExpired', { days: RETURN_WINDOW_DAYS })
      };
    }

    const refundAmount = shipment.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const request = await refundRepo.createRefundRequest(orderId, userId, reason.trim(), {
      id: shipment.id,
      refund_amount: refundAmount
    });
    if (!request) {
      return { success: false, status: 400, message: t('refund.activeRequestExists') };
    }

    await queueVendorReturnEmail(request);

    return {
      success: true,
      status: 201,
      message: t('refund.requestSubmitted'),
      data: serializeRequest(request, lang)
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.submitError') };
  }
};

export const getMyRefundRequests = async (t, lang, userId) => {
  try {
    const requests = await refundRepo.findRefundRequestsForUser(userId);
    return { success: true, status: 200, data: { items: requests.map((r) => serializeRequest(r, lang)) } };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.loadError') };
  }
};

export const getAllRefundRequestsAdmin = async (t, lang, page = 1, limit = 20, status) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const { requests, totalCount } = await refundRepo.findAllRefundRequests(
      skip,
      limitNumber,
      status
    );
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: requests.map((r) => serializeRequest(r, lang)),
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.loadError') };
  }
};

export const approveRefundRequest = async (t, lang, id) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: t('refund.requestNotFound') };
    }
    if (existing.status !== 'pending') {
      return { success: false, status: 400, message: t('refund.alreadyReviewed') };
    }

    const request = await refundRepo.approveRefundRequest(id);
    await queueRefundStatusEmail(request);

    return {
      success: true,
      status: 200,
      message: t('refund.approvedMessage'),
      data: serializeRequest(request, lang)
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.approveError') };
  }
};

export const rejectRefundRequest = async (t, lang, id, adminNote) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: t('refund.requestNotFound') };
    }
    if (existing.status !== 'pending') {
      return { success: false, status: 400, message: t('refund.alreadyReviewed') };
    }

    const request = await refundRepo.rejectRefundRequest(id, adminNote);
    await queueRefundStatusEmail(request);

    return {
      success: true,
      status: 200,
      message: t('refund.rejectedMessage'),
      data: serializeRequest(request, lang)
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.rejectError') };
  }
};

export const cancelAwaitingReturn = async (t, lang, id, adminNote) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: t('refund.requestNotFound') };
    }
    if (existing.status !== 'awaiting_return') {
      return { success: false, status: 400, message: t('refund.notAwaitingReturn') };
    }

    const request = await refundRepo.cancelAwaitingReturn(id, adminNote);
    await queueRefundStatusEmail(request);

    return {
      success: true,
      status: 200,
      message: t('refund.cancelledMessage'),
      data: serializeRequest(request, lang)
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.cancelError') };
  }
};

export const completeRefund = async (t, lang, id) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: t('refund.requestNotFound') };
    }
    if (existing.status !== 'awaiting_return') {
      return {
        success: false,
        status: 400,
        message: t('refund.notApprovedYet')
      };
    }
    if (!existing.order?.payment_intent_id) {
      return {
        success: false,
        status: 400,
        message: t('refund.paymentIntentMissing')
      };
    }

    try {
      // A request for one shipment refunds only that shipment's amount. The
      // idempotency key makes a retried click unable to refund the same request twice.
      await stripe.refunds.create(
        {
          payment_intent: existing.order.payment_intent_id,
          ...(existing.vendor_order_id && existing.refund_amount ? { amount: existing.refund_amount } : {})
        },
        { idempotencyKey: `refund-request-${existing.id}` }
      );
    } catch (stripeErr) {
      logger.error({ err: stripeErr }, 'فشل تنفيذ الاسترجاع عبر Stripe');
      return {
        success: false,
        status: 502,
        message: t('refund.stripeFailed')
      };
    }

    const result = await refundRepo.completeRefund(id);
    emitProductsUpdated();
    await queueRefundStatusEmail(result);

    return {
      success: true,
      status: 200,
      message: t('refund.completedMessage'),
      data: serializeRequest(result, lang)
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('refund.completeError') };
  }
};

// What a vendor may see of a return request: the shipment, the amount and the reason,
// but never who the customer is.
export const getVendorReturns = async (t, lang, vendorId, page = 1, limit = 20) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const { requests, totalCount } = await refundRepo.findRefundRequestsForVendor(vendorId, skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: requests.map((request) => ({
          id: request.id,
          order_id: request.order_id,
          status: request.status,
          reason: request.reason,
          refund_amount: request.refund_amount,
          created_at: request.created_at,
          reviewed_at: request.reviewed_at,
          items: (request.vendor_order?.items ?? []).map((item) => ({
            product_id: item.product_id,
            title: pickLocalized(item.product?.title, lang),
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
        })),
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.returns.loadError') };
  }
};