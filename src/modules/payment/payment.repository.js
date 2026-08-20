import prisma from '../../core/db.js';

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

export const markOrderPaid = async (orderId) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: 'paid' },
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
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: 'failed' },
      include: { items: true }
    });

    for (const item of order.items) {
      await tx.book.update({
        where: { id: item.book_id },
        data: { stock: { increment: item.quantity } }
      });
    }

    return order;
  });
};