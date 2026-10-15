import stripe from '../../core/config/stripe.config.js';
import * as cartRepo from '../cart/cart.repository.js';
import * as paymentRepo from './payment.repository.js';
import * as refundRepo from '../refund/refund.repository.js';
import redisClient from '../../core/config/redis.client.js';
import { getIO } from '../../core/config/socket.config.js';
import { addPaymentSuccessEmailJob, addPaymentFailedEmailJob } from '../../core/email.queue.js';
import { pickLocalized } from '../../core/i18n/localized.js';
import logger from '../../core/logger.js';

const PENDING_ORDER_EXPIRY_MINUTES = 30;

const invalidateProductCache = async (productId) => {
  try {
    await redisClient.del(['products:all', `products:${productId}`]);
  } catch (redisErr) {
  }
};

const emitProductsUpdated = () => {
  try {
    getIO().emit('products_updated');
  } catch (err) {
  }
};

const queuePaymentFailedEmail = async (order) => {
  if (order?.user?.email) {
    try {
      await addPaymentFailedEmailJob(order.user.email, order.user.name, order, order.user.preferred_lang);
    } catch (err) {
    }
  }
};

export const expireStalePendingOrders = async (userId) => {
  try {
    const stale = await paymentRepo.findExpiredPendingOrdersByUser(
      userId,
      PENDING_ORDER_EXPIRY_MINUTES
    );

    for (const order of stale) {
      if (order.stripe_session_id) {
        try {
          await stripe.checkout.sessions.expire(order.stripe_session_id);
        } catch (err) {
        }
      }
      const failedOrder = await paymentRepo.markOrderFailed(order.id);

      if (failedOrder?.items?.length) {
        for (const item of failedOrder.items) {
          await invalidateProductCache(item.product_id);
        }
        emitProductsUpdated();
        await queuePaymentFailedEmail(failedOrder);
      }
    }
  } catch (err) {
  }
};

export const createCheckoutSession = async (t, lang, userId, shipping) => {
  try {
    const cart = await cartRepo.getOrCreateCart(userId);

    if (!cart.items || cart.items.length === 0) {
      return { success: false, status: 400, message: t('payment.cartEmpty') };
    }
    if (cart.items.some((item) => item.variant?.product?.vendor?.owner_id === userId)) {
      return { success: false, status: 400, message: t('payment.ownProductsInCart') };
    }

    const existingPending = await paymentRepo.findPendingOrderByUser(userId);
    if (existingPending) {
      if (existingPending.stripe_session_id) {
        try {
          await stripe.checkout.sessions.expire(existingPending.stripe_session_id);
        } catch (err) {
        }
      }
      await paymentRepo.cancelOrder(existingPending.id);
    }

    const order = await paymentRepo.createPendingOrderFromCart(userId, cart, shipping);

    const line_items = order.items.map((item) => ({
      price_data: {
        currency: 'egp',
        product_data: { name: pickLocalized(item.product.title, lang) },
        unit_amount: item.unit_price
      },
      quantity: item.quantity
    }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${process.env.CLIENT_URL_DEV}/checkout/success?order_id=${order.id}`,
      cancel_url: `${process.env.CLIENT_URL_DEV}/checkout/cancel?order_id=${order.id}`,
      metadata: { order_id: order.id.toString() }
    });

    await paymentRepo.attachStripeSession(order.id, session.id);

    return { success: true, status: 200, data: { url: session.url } };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('payment.checkoutError') };
  }
};

export const handleWebhookEvent = async (rawBody, signature) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error({ err: err }, 'فشل التحقق من توقيع الـ webhook');
    return { success: false, status: 400, message: 'توقيع غير صالح' };
  }

  const idempotencyKey = `stripe:webhook:${event.id}`;
  const alreadyProcessed = await redisClient.get(idempotencyKey);

  if (alreadyProcessed) {
    return { success: true, status: 200 };
  }

  await redisClient.set(idempotencyKey, '1', { EX: 60 * 60 * 24 });
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orderId = parseInt(session.metadata.order_id);
      const paidOrder = await paymentRepo.markOrderPaid(orderId, session.payment_intent);

      if (paidOrder?.user?.email) {
        try {
          await addPaymentSuccessEmailJob(paidOrder.user.email, paidOrder.user.name, paidOrder, paidOrder.user.preferred_lang);
        } catch (err) {
        }
      }
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      const orderId = parseInt(session.metadata.order_id);
      const failedOrder = await paymentRepo.markOrderFailed(orderId);

      if (failedOrder?.items?.length) {
        for (const item of failedOrder.items) {
          await invalidateProductCache(item.product_id);
        }
        emitProductsUpdated();
        await queuePaymentFailedEmail(failedOrder);
      }
      break;
    }
    
    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;
      if (paymentIntentId && charge.refunded === true) {
        const order = await refundRepo.markOrderRefundedFromWebhook(paymentIntentId);
        if (order) emitProductsUpdated();
      }
      break;
    }

    default:
      break;
  }

  return { success: true, status: 200 };
};