import prisma from '../../core/db.js';

export const findPendingOrderByUser = async (userId) => {
  return prisma.order.findFirst({
    where: { user_id: userId, status: 'pending' },
    orderBy: { created_at: 'desc' }
  });
};

export const findExpiredPendingOrdersByUser = async (userId, olderThanMinutes) => {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return prisma.order.findMany({
    where: { user_id: userId, status: 'pending', created_at: { lt: cutoff } }
  });
};

export const cancelOrder = async (orderId) => {
  return prisma.order.update({
    where: { id: orderId },
    data: { status: 'cancelled' }
  });
};

export const createPendingOrderFromCart = async (userId, cart) => {
  return prisma.$transaction(async (tx) => {
    const totalAmount = cart.items.reduce(
      (sum, item) => sum + item.book.price * item.quantity,
      0
    );

    const order = await tx.order.create({
      data: {
        user_id: userId,
        status: 'pending',
        total_amount: totalAmount,
        items: {
          create: cart.items.map((item) => ({
            book_id: item.book_id,
            quantity: item.quantity,
            unit_price: item.book.price
          }))
        }
      },
      include: { items: { include: { book: true } } }
    });

    return order;
  });
};

export const attachStripeSession = async (orderId, sessionId) => {
  return prisma.order.update({
    where: { id: orderId },
    data: { stripe_session_id: sessionId }
  });
};

export const findOrderBySessionId = async (sessionId) => {
  return prisma.order.findUnique({
    where: { stripe_session_id: sessionId },
    include: { items: { include: { book: true } } }
  });
};

export const markOrderPaid = async (orderId, paymentIntentId) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: 'paid', payment_intent_id: paymentIntentId, paid_at: new Date() },
      include: { items: true, user: { include: { cart: true } } }
    });

    if (order.user?.cart) {
      await tx.cartItem.deleteMany({ where: { cart_id: order.user.cart.id } });
    }

    return order;
  });
};

export const markOrderFailed = async (orderId) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order || order.status !== 'pending') {
      return order;
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: 'failed' },
      include: { items: true }
    });

    const cart = await tx.cart.findUnique({ where: { user_id: updated.user_id } });

    if (cart) {
      for (const item of updated.items) {
        const cartItem = await tx.cartItem.findUnique({
          where: { cart_id_book_id: { cart_id: cart.id, book_id: item.book_id } }
        });

        if (!cartItem) continue;

        const qtyToRelease = Math.min(cartItem.quantity, item.quantity);

        if (cartItem.quantity > qtyToRelease) {
          await tx.cartItem.update({
            where: { id: cartItem.id },
            data: { quantity: { decrement: qtyToRelease } }
          });
        } else {
          await tx.cartItem.delete({ where: { id: cartItem.id } });
        }

        await tx.book.update({
          where: { id: item.book_id },
          data: { stock: { increment: qtyToRelease } }
        });
      }
    }

    return updated;
  });
};