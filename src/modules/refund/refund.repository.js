import prisma from '../../core/db.js';
import redisClient from '../../core/config/redis.client.js';
import logger from '../../core/logger.js';

const invalidateBooksCache = async (bookIds) => {
  try {
    const keys = [...new Set(bookIds)].map((id) => `books:${id}`);
    if (keys.length) await redisClient.del(keys);
  } catch (err) {
    logger.warn({ err }, 'تخطي خطأ مسح الكاش من Redis أثناء تحديث الكمية بعد الاسترجاع');
  }
};

const USER_SELECT = { id: true, name: true, email: true, preferred_lang: true };

const VENDOR_ORDER_INCLUDE = {
  vendor: {
    select: { id: true, store_name: true, owner: { select: { name: true, email: true, preferred_lang: true } } }
  },
  items: { include: { book: true } }
};

const REQUEST_INCLUDE = {
  order: { include: { items: { include: { book: true } } } },
  vendor_order: { include: VENDOR_ORDER_INCLUDE },
  user: { select: USER_SELECT }
};

export const findOrderForRefundRequest = async (orderId, userId) => {
  return prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: { refundRequests: true, vendorOrders: { include: { items: true } } }
  });
};


export const findActiveRefundRequest = async (orderId, vendorOrderId) => {
  return prisma.refundRequest.findFirst({
    where: {
      order_id: orderId,
      status: { in: ['pending', 'awaiting_return'] },
      OR: [{ vendor_order_id: null }, { vendor_order_id: vendorOrderId }]
    }
  });
};

const setReturnStatus = async (tx, request, { from, to }) => {
  const where = request.vendor_order_id
    ? { id: request.vendor_order_id }
    : { order_id: request.order_id };

  await tx.vendorOrder.updateMany({
    where: { ...where, return_status: { in: from } },
    data: { return_status: to }
  });
};

export const createRefundRequest = async (orderId, userId, reason, shipment) => {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.vendorOrder.updateMany({
      where: { id: shipment.id, return_status: null },
      data: { return_status: 'requested' }
    });
    if (claimed.count === 0) return null;

    return tx.refundRequest.create({
      data: {
        order_id: orderId,
        user_id: userId,
        reason,
        vendor_order_id: shipment.id,
        refund_amount: shipment.refund_amount
      },
      include: REQUEST_INCLUDE
    });
  });
};

export const findRefundRequestsForVendor = async (vendorId, skip, take) => {
  const where = { vendor_order: { vendor_id: vendorId } };

  const [requests, totalCount] = await Promise.all([
    prisma.refundRequest.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: { vendor_order: { include: { items: { include: { book: true } } } } }
    }),
    prisma.refundRequest.count({ where })
  ]);

  return { requests, totalCount };
};

export const findRefundRequestsForUser = async (userId) => {
  return prisma.refundRequest.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: { order: true, vendor_order: { include: VENDOR_ORDER_INCLUDE } }
  });
};

export const findAllRefundRequests = async (skip, limit, status) => {
  const where = status ? { status } : {};

  const [requests, totalCount] = await Promise.all([
    prisma.refundRequest.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: REQUEST_INCLUDE
    }),
    prisma.refundRequest.count({ where })
  ]);

  return { requests, totalCount };
};

export const findRefundRequestById = async (id) => {
  return prisma.refundRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
};

export const approveRefundRequest = async (id) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.update({
      where: { id },
      data: { status: 'awaiting_return', reviewed_at: new Date() },
      include: REQUEST_INCLUDE
    });

    await setReturnStatus(tx, request, { from: ['requested'], to: 'approved' });

    return request;
  });
};

const closeWithoutRefund = (status) => async (id, adminNote) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.update({
      where: { id },
      data: { status, admin_note: adminNote ?? null, reviewed_at: new Date() },
      include: REQUEST_INCLUDE
    });
    await setReturnStatus(tx, request, { from: ['requested', 'approved'], to: null });

    return request;
  });
};

export const rejectRefundRequest = closeWithoutRefund('rejected');
export const cancelAwaitingReturn = closeWithoutRefund('cancelled');

const refundShipments = async (tx, order, shipmentIds) => {
  const shipments = await tx.vendorOrder.findMany({
    where: { order_id: order.id, return_status: { not: 'refunded' }, ...(shipmentIds ? { id: { in: shipmentIds } } : {}) },
    include: { items: true }
  });

  const restockedBookIds = [];
  const totalShipments = await tx.vendorOrder.count({ where: { order_id: order.id } });
  const lines = totalShipments === 0 ? order.items : shipments.flatMap((s) => s.items);

  if (shipments.length) {
    await tx.vendorOrder.updateMany({
      where: { id: { in: shipments.map((s) => s.id) } },
      data: { return_status: 'refunded', refunded_at: new Date() }
    });
  }

  for (const item of lines) {
    await tx.productVariant.updateMany({
      where: { product_id: item.book_id },
      data: { stock: { increment: item.quantity } }
    });
    restockedBookIds.push(item.book_id);
  }

  const remaining = await tx.vendorOrder.count({
    where: { order_id: order.id, return_status: { not: 'refunded' } }
  });
  if (remaining === 0) {
    await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
  }

  return restockedBookIds;
};

export const completeRefund = async (id) => {
  let restocked = [];

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    if (!request) return null;

    const updatedRequest = await tx.refundRequest.update({
      where: { id },
      data: { status: 'completed' }
    });

    restocked = await refundShipments(
      tx,
      request.order,
      request.vendor_order_id ? [request.vendor_order_id] : null
    );

    return { ...updatedRequest, order: request.order, vendor_order: request.vendor_order, user: request.user };
  });

  if (restocked.length) await invalidateBooksCache(restocked);

  return result;
};

export const markOrderRefundedFromWebhook = async (paymentIntentId) => {
  let restocked = [];

  const order = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { payment_intent_id: paymentIntentId },
      include: { items: true }
    });

    if (!order || order.status === 'refunded') return null;

    await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });

    await tx.refundRequest.updateMany({
      where: { order_id: order.id, status: { in: ['pending', 'awaiting_return'] } },
      data: { status: 'completed', reviewed_at: new Date() }
    });

    restocked = await refundShipments(tx, order, null);

    return order;
  });

  if (restocked.length) await invalidateBooksCache(restocked);

  return order;
};