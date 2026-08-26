import prisma from '../../core/db.js';
import redisClient from '../../core/config/redis.client.js';

const invalidateBooksCache = async (bookIds) => {
  try {
    const keys = [...new Set(bookIds)].map((id) => `books:${id}`);
    if (keys.length) await redisClient.del(keys);
  } catch (err) {
    console.log('تخطي خطأ مسح الكاش من Redis أثناء تحديث الكمية بعد الاسترجاع');
  }
};

export const findOrderForRefundRequest = async (orderId, userId) => {
  return prisma.order.findFirst({
    where: { id: orderId, user_id: userId },
    include: { refundRequests: true }
  });
};

export const findActiveRefundRequestForOrder = async (orderId) => {
  return prisma.refundRequest.findFirst({
    where: {
      order_id: orderId,
      status: { in: ['pending', 'awaiting_return'] }
    }
  });
};

export const createRefundRequest = async (orderId, userId, reason) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.create({
      data: { order_id: orderId, user_id: userId, reason }
    });

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'return_requested' }
    });

    return request;
  });
};

export const findRefundRequestsForUser = async (userId) => {
  return prisma.refundRequest.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: { order: true }
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
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { include: { items: { include: { book: true } } } }
      }
    }),
    prisma.refundRequest.count({ where })
  ]);

  return { requests, totalCount };
};

export const findRefundRequestById = async (id) => {
  return prisma.refundRequest.findUnique({
    where: { id },
    include: {
      order: true,
      user: { select: { id: true, name: true, email: true } }
    }
  });
};

export const approveRefundRequest = async (id) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.update({
      where: { id },
      data: { status: 'awaiting_return', reviewed_at: new Date() },
      include: { order: true }
    });

    await tx.order.update({
      where: { id: request.order_id },
      data: { status: 'return_approved' }
    });

    return request;
  });
};

export const rejectRefundRequest = async (id, adminNote) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.update({
      where: { id },
      data: { status: 'rejected', admin_note: adminNote ?? null, reviewed_at: new Date() },
      include: { order: true }
    });

    await tx.order.update({
      where: { id: request.order_id },
      data: { status: 'paid' }
    });

    return request;
  });
};

export const cancelAwaitingReturn = async (id, adminNote) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.update({
      where: { id },
      data: { status: 'cancelled', admin_note: adminNote ?? null, reviewed_at: new Date() },
      include: { order: true }
    });

    await tx.order.update({
      where: { id: request.order_id },
      data: { status: 'paid' }
    });

    return request;
  });
};

export const completeRefund = async (id) => {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.findUnique({
      where: { id },
      include: { order: { include: { items: true } } }
    });

    if (!request) return null;

    const updatedRequest = await tx.refundRequest.update({
      where: { id },
      data: { status: 'completed' }
    });

    await tx.order.update({
      where: { id: request.order_id },
      data: { status: 'refunded' }
    });

    for (const item of request.order.items) {
      await tx.book.update({
        where: { id: item.book_id },
        data: { stock: { increment: item.quantity } }
      });
    }

    return { ...updatedRequest, order: request.order };
  });

  if (result?.order?.items?.length) {
    await invalidateBooksCache(result.order.items.map((item) => item.book_id));
  }

  return result;
};

export const markOrderRefundedFromWebhook = async (paymentIntentId) => {
  const order = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { payment_intent_id: paymentIntentId },
      include: { items: true, refundRequests: true }
    });

    if (!order || order.status === 'refunded') return null;

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'refunded' }
    });

    const activeRequest = order.refundRequests.find((r) =>
      ['pending', 'awaiting_return'].includes(r.status)
    );

    if (activeRequest) {
      await tx.refundRequest.update({
        where: { id: activeRequest.id },
        data: { status: 'completed', reviewed_at: new Date() }
      });
    }

    for (const item of order.items) {
      await tx.book.update({
        where: { id: item.book_id },
        data: { stock: { increment: item.quantity } }
      });
    }

    return order;
  });

  if (order?.items?.length) {
    await invalidateBooksCache(order.items.map((item) => item.book_id));
  }

  return order;
};