import stripe from '../../core/config/stripe.config.js';
import * as refundRepo from './refund.repository.js';
import { getIO } from '../../core/config/socket.config.js';
import { addRefundStatusEmailJob } from '../../core/email.queue.js';

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
      await addRefundStatusEmailJob(request.user.email, request.user.name, request);
    } catch (err) {
      console.error('فشل جدولة إيميل حالة الاسترجاع:', err.message);
    }
  }
};

const serializeRequest = (request) => ({
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
              title: item.book?.title,
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

export const requestRefund = async (orderId, userId, reason) => {
  try {
    if (!reason || !reason.trim()) {
      return { success: false, status: 400, message: 'من فضلك اكتب سبب الاسترجاع' };
    }

    const order = await refundRepo.findOrderForRefundRequest(orderId, userId);

    if (!order) {
      return { success: false, status: 404, message: 'الأوردر غير موجود' };
    }

    if (order.status !== 'paid') {
      return {
        success: false,
        status: 400,
        message: 'مينفعش تطلب استرجاع لأوردر لسه مدفعش أو خلص معاه الاسترجاع بالفعل'
      };
    }

    const activeRequest = await refundRepo.findActiveRefundRequestForOrder(orderId);
    if (activeRequest) {
      return { success: false, status: 400, message: 'فيه طلب استرجاع قائم بالفعل لنفس الأوردر' };
    }

    if (!order.paid_at) {
      return { success: false, status: 400, message: 'تعذر التحقق من تاريخ الدفع لهذا الأوردر' };
    }

    const deadline = new Date(order.paid_at);
    deadline.setDate(deadline.getDate() + RETURN_WINDOW_DAYS);

    if (new Date() > deadline) {
      return {
        success: false,
        status: 400,
        message: `انتهت مدة الـ ${RETURN_WINDOW_DAYS} يوم المسموحة لطلب استرجاع هذا الأوردر`
      };
    }

    const request = await refundRepo.createRefundRequest(orderId, userId, reason.trim());

    return {
      success: true,
      status: 201,
      message: 'تم إرسال طلب الاسترجاع، هيتم مراجعته قريبًا',
      data: serializeRequest(request)
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء إرسال طلب الاسترجاع' };
  }
};

export const getMyRefundRequests = async (userId) => {
  try {
    const requests = await refundRepo.findRefundRequestsForUser(userId);
    return { success: true, status: 200, data: { items: requests.map(serializeRequest) } };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل طلبات الاسترجاع' };
  }
};

export const getAllRefundRequestsAdmin = async (page = 1, limit = 20, status) => {
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
        items: requests.map(serializeRequest),
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
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل طلبات الاسترجاع' };
  }
};

export const approveRefundRequest = async (id) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: 'طلب الاسترجاع غير موجود' };
    }
    if (existing.status !== 'pending') {
      return { success: false, status: 400, message: 'الطلب ده اتراجع بالفعل' };
    }

    const request = await refundRepo.approveRefundRequest(id);
    await queueRefundStatusEmail(request);

    return {
      success: true,
      status: 200,
      message: 'تمت الموافقة على الطلب، في انتظار استلام الكتاب من العميل',
      data: serializeRequest(request)
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء الموافقة على الطلب' };
  }
};

export const rejectRefundRequest = async (id, adminNote) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: 'طلب الاسترجاع غير موجود' };
    }
    if (existing.status !== 'pending') {
      return { success: false, status: 400, message: 'الطلب ده اتراجع بالفعل' };
    }

    const request = await refundRepo.rejectRefundRequest(id, adminNote);
    await queueRefundStatusEmail(request);

    return {
      success: true,
      status: 200,
      message: 'تم رفض طلب الاسترجاع',
      data: serializeRequest(request)
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء رفض الطلب' };
  }
};

export const cancelAwaitingReturn = async (id, adminNote) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: 'طلب الاسترجاع غير موجود' };
    }
    if (existing.status !== 'awaiting_return') {
      return { success: false, status: 400, message: 'الطلب ده مش في حالة انتظار استرجاع الكتاب' };
    }

    const request = await refundRepo.cancelAwaitingReturn(id, adminNote);
    await queueRefundStatusEmail(request);

    return {
      success: true,
      status: 200,
      message: 'تم إلغاء طلب الاسترجاع، الأوردر رجع لحالته الطبيعية',
      data: serializeRequest(request)
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء إلغاء الطلب' };
  }
};

export const completeRefund = async (id) => {
  try {
    const existing = await refundRepo.findRefundRequestById(id);
    if (!existing) {
      return { success: false, status: 404, message: 'طلب الاسترجاع غير موجود' };
    }
    if (existing.status !== 'awaiting_return') {
      return {
        success: false,
        status: 400,
        message: 'لازم توافق على الطلب وتستنى الكتاب الأول قبل تنفيذ الاسترجاع'
      };
    }
    if (!existing.order?.payment_intent_id) {
      return {
        success: false,
        status: 400,
        message: 'تعذر إيجاد عملية الدفع المرتبطة بهذا الأوردر'
      };
    }

    try {
      await stripe.refunds.create({ payment_intent: existing.order.payment_intent_id });
    } catch (stripeErr) {
      console.error('فشل تنفيذ الاسترجاع عبر Stripe:', stripeErr.message);
      return {
        success: false,
        status: 502,
        message: 'فشل تنفيذ عملية الاسترجاع مع بوابة الدفع، حاول تاني أو راجع حساب Stripe'
      };
    }

    const result = await refundRepo.completeRefund(id);
    emitBooksUpdated();
    await queueRefundStatusEmail(result);

    return {
      success: true,
      status: 200,
      message: 'تم تنفيذ الاسترجاع بنجاح، وهترجع الفلوس للعميل خلال أيام حسب بنكه',
      data: serializeRequest(result)
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تنفيذ الاسترجاع' };
  }
};