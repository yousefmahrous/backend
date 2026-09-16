import stripe from '../../core/config/stripe.config.js';
import * as refundRepo from './refund.repository.js';
import { getIO } from '../../core/config/socket.config.js';
import { addRefundStatusEmailJob } from '../../core/email.queue.js';
import { pickLocalized } from '../../core/i18n/localized.js';
import logger from '../../core/logger.js';

const RETURN_WINDOW_DAYS = 14;

const emitBooksUpdated = () => {
  try {
    getIO().emit('books_updated');
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
  order: request.order
    ? {
        id: request.order.id,
        status: request.order.status,
        total_amount: request.order.total_amount,
        currency: request.order.currency,
        paid_at: request.order.paid_at,
        items: request.order.items
          ? request.order.items.map((item) => ({
              book_id: item.book_id,
              title: pickLocalized(item.book?.title, lang),
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

export const requestRefund = async (t, lang, orderId, userId, reason) => {
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

    const activeRequest = await refundRepo.findActiveRefundRequestForOrder(orderId);
    if (activeRequest) {
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

    const request = await refundRepo.createRefundRequest(orderId, userId, reason.trim());

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
      await stripe.refunds.create({ payment_intent: existing.order.payment_intent_id });
    } catch (stripeErr) {
      logger.error({ err: stripeErr }, 'فشل تنفيذ الاسترجاع عبر Stripe');
      return {
        success: false,
        status: 502,
        message: t('refund.stripeFailed')
      };
    }

    const result = await refundRepo.completeRefund(id);
    emitBooksUpdated();
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