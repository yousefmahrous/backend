import prisma from '../../core/db.js';
import { buildSnapshot, parseDefaultBps } from '../commission/commission.js';

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

export const createPendingOrderFromCart = async (userId, cart, shipping) => {
  return prisma.$transaction(async (tx) => {
    const totalAmount = cart.items.reduce(
      (sum, item) => sum + item.variant.price * item.quantity,
      0
    );

    const order = await tx.order.create({
      data: {
        user_id: userId,
        status: 'pending',
        total_amount: totalAmount,
        shipping_name: shipping.name,
        shipping_phone: shipping.phone,
        shipping_address: shipping.address,
        shipping_city: shipping.city,
        shipping_notes: shipping.notes ?? null
      }
    });

    const vendorIds = [...new Set(cart.items.map((item) => item.variant.product.vendor_id))];
    const vendorOrderIdByVendor = new Map();

    for (const vendorId of vendorIds) {
      const vendorOrder = await tx.vendorOrder.create({
        data: { order_id: order.id, vendor_id: vendorId }
      });
      vendorOrderIdByVendor.set(vendorId, vendorOrder.id);
    }

    await tx.orderItem.createMany({
      data: cart.items.map((item) => ({
        order_id: order.id,
        book_id: item.book_id,
        vendor_order_id: vendorOrderIdByVendor.get(item.variant.product.vendor_id),
        quantity: item.quantity,
        unit_price: item.variant.price
      }))
    });

    return tx.order.findUnique({
      where: { id: order.id },
      include: { items: { include: { book: true } } }
    });
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

const freezeCommissionSnapshot = async (tx, orderId) => {
  const setting = await tx.platformSetting.findUnique({ where: { key: 'default_commission_bps' } });
  const defaultBps = parseDefaultBps(setting?.value);

  const vendorOrders = await tx.vendorOrder.findMany({
    where: { order_id: orderId },
    include: {
      vendor: { select: { is_platform: true, commission_bps: true } },
      items: { select: { unit_price: true, quantity: true } }
    }
  });

  for (const vendorOrder of vendorOrders) {
    await tx.vendorOrder.updateMany({
      where: { id: vendorOrder.id, gross_amount: null },
      data: buildSnapshot(vendorOrder.items, vendorOrder.vendor, defaultBps)
    });
  }
};

export const markOrderPaid = async (orderId, paymentIntentId) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: 'paid', payment_intent_id: paymentIntentId, paid_at: new Date() },
      include: {
        items: { include: { book: true } },
        user: { include: { cart: true } }
      }
    });

    if (order.user?.cart) {
      await tx.cartItem.deleteMany({ where: { cart_id: order.user.cart.id } });
    }

    await freezeCommissionSnapshot(tx, orderId);

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
      include: {
        items: { include: { book: true } },
        user: { select: { id: true, name: true, email: true, preferred_lang: true } }
      }
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

        await tx.productVariant.updateMany({
          where: { product_id: item.book_id },
          data: { stock: { increment: qtyToRelease } }
        });
      }
    }

    return updated;
  });
};