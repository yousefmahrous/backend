import stripe from '../../core/config/stripe.config.js';
import * as cartRepo from '../cart/cart.repository.js';
import * as paymentRepo from './payment.repository.js';

export const createCheckoutSession = async (userId) => {
  try {
    const cart = await cartRepo.getOrCreateCart(userId);

    if (!cart.items || cart.items.length === 0) {
      return { success: false, status: 400, message: 'العربية فاضية، مينفعش تكمل دفع' };
    }

    const order = await paymentRepo.createPendingOrderFromCart(userId, cart);

    const line_items = order.items.map((item) => ({
      price_data: {
        currency: 'egp',
        product_data: { name: item.book.title },
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
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء إنشاء جلسة الدفع' };
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
    console.error('فشل التحقق من توقيع الـ webhook:', err.message);
    return { success: false, status: 400, message: 'توقيع غير صالح' };
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orderId = parseInt(session.metadata.order_id);
      await paymentRepo.markOrderPaid(orderId);
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      const orderId = parseInt(session.metadata.order_id);
      await paymentRepo.markOrderFailed(orderId);
      break;
    }

    default:
      break;
  }

  return { success: true, status: 200 };
};