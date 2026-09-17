import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./payment.repository.js', () => ({
  findPendingOrderByUser: vi.fn(),
  findExpiredPendingOrdersByUser: vi.fn(),
  cancelOrder: vi.fn(),
  createPendingOrderFromCart: vi.fn(),
  attachStripeSession: vi.fn(),
  findOrderBySessionId: vi.fn(),
  markOrderPaid: vi.fn(),
  markOrderFailed: vi.fn(),
}));

vi.mock('../cart/cart.repository.js', () => ({
  getOrCreateCart: vi.fn(),
}));

vi.mock('../refund/refund.repository.js', () => ({
  markOrderRefundedFromWebhook: vi.fn(),
}));

vi.mock('../../core/config/stripe.config.js', () => ({
  default: {
    checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
}));

vi.mock('../../core/config/redis.client.js', () => ({
  default: { del: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

vi.mock('../../core/config/socket.config.js', () => ({
  getIO: vi.fn(() => {
    throw new Error('Socket.io is not initialized!');
  }),
}));

vi.mock('../../core/email.queue.js', () => ({
  addPaymentSuccessEmailJob: vi.fn(),
  addPaymentFailedEmailJob: vi.fn(),
}));

const paymentRepo = await import('./payment.repository.js');
const cartRepo = await import('../cart/cart.repository.js');
const refundRepo = await import('../refund/refund.repository.js');
const stripe = (await import('../../core/config/stripe.config.js')).default;
const redisClient = (await import('../../core/config/redis.client.js')).default;
const emailQueue = await import('../../core/email.queue.js');
const paymentService = await import('./payment.service.js');

const t = fakeT;

describe('payment.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('refuses to check out an empty cart without creating an order', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue({ items: [] });

      const result = await paymentService.createCheckoutSession(t, 'ar', 5);

      expect(result).toEqual({ success: false, status: 400, message: 'payment.cartEmpty' });
      expect(paymentRepo.createPendingOrderFromCart).not.toHaveBeenCalled();
    });

    it('expires and cancels a stale pending order before creating a new one', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue({ items: [{ book_id: 1 }] });
      paymentRepo.findPendingOrderByUser.mockResolvedValue({ id: 9, stripe_session_id: 'sess_old' });
      paymentRepo.createPendingOrderFromCart.mockResolvedValue({
        id: 10,
        items: [{ book: { title: { ar: 'كتاب' } }, unit_price: 100, quantity: 1 }],
      });
      stripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_new', url: 'https://stripe/pay' });

      const result = await paymentService.createCheckoutSession(t, 'ar', 5);

      expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('sess_old');
      expect(paymentRepo.cancelOrder).toHaveBeenCalledWith(9);
      expect(paymentRepo.attachStripeSession).toHaveBeenCalledWith(10, 'sess_new');
      expect(result).toEqual({ success: true, status: 200, data: { url: 'https://stripe/pay' } });
    });

    it('still cancels the stale order locally even when Stripe fails to expire its session', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue({ items: [{ book_id: 1 }] });
      paymentRepo.findPendingOrderByUser.mockResolvedValue({ id: 9, stripe_session_id: 'sess_old' });
      stripe.checkout.sessions.expire.mockRejectedValue(new Error('already expired'));
      paymentRepo.createPendingOrderFromCart.mockResolvedValue({ id: 10, items: [] });
      stripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_new', url: 'https://stripe/pay' });

      const result = await paymentService.createCheckoutSession(t, 'ar', 5);

      expect(paymentRepo.cancelOrder).toHaveBeenCalledWith(9);
      expect(result).toMatchObject({ success: true, status: 200 });
    });

    it('builds Stripe line items from the order with the correct amount and quantity', async () => {
      cartRepo.getOrCreateCart.mockResolvedValue({ items: [{ book_id: 1 }] });
      paymentRepo.findPendingOrderByUser.mockResolvedValue(null);
      paymentRepo.createPendingOrderFromCart.mockResolvedValue({
        id: 10,
        items: [{ book: { title: { ar: 'كتاب', en: 'Book' } }, unit_price: 2500, quantity: 3 }],
      });
      stripe.checkout.sessions.create.mockResolvedValue({ id: 'sess_new', url: 'https://stripe/pay' });

      await paymentService.createCheckoutSession(t, 'en', 5);

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'egp',
                product_data: { name: 'Book' },
                unit_amount: 2500,
              },
              quantity: 3,
            },
          ],
          metadata: { order_id: '10' },
        })
      );
    });

    it('returns a 500 when something throws unexpectedly', async () => {
      cartRepo.getOrCreateCart.mockRejectedValue(new Error('db down'));

      const result = await paymentService.createCheckoutSession(t, 'ar', 5);

      expect(result).toEqual({ success: false, status: 500, message: 'payment.checkoutError' });
    });
  });

  describe('handleWebhookEvent', () => {
    it('rejects a request with an invalid Stripe signature without touching the database', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });

      const result = await paymentService.handleWebhookEvent('raw-body', 'bad-sig');

      expect(result).toEqual({ success: false, status: 400, message: 'توقيع غير صالح' });
      expect(paymentRepo.markOrderPaid).not.toHaveBeenCalled();
    });

    it('is idempotent: skips processing (but still returns success) when the event was already handled', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' });
      redisClient.get.mockResolvedValue('1');

      const result = await paymentService.handleWebhookEvent('raw-body', 'sig');

      expect(redisClient.set).not.toHaveBeenCalled();
      expect(paymentRepo.markOrderPaid).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, status: 200 });
    });

    it('marks the order paid and queues a success email on checkout.session.completed', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { metadata: { order_id: '10' }, payment_intent: 'pi_123' } },
      });
      redisClient.get.mockResolvedValue(null);
      paymentRepo.markOrderPaid.mockResolvedValue({
        id: 10,
        user: { email: 'a@b.com', name: 'Ali', preferred_lang: 'ar' },
      });

      const result = await paymentService.handleWebhookEvent('raw-body', 'sig');

      expect(paymentRepo.markOrderPaid).toHaveBeenCalledWith(10, 'pi_123');
      expect(emailQueue.addPaymentSuccessEmailJob).toHaveBeenCalledWith(
        'a@b.com',
        'Ali',
        expect.objectContaining({ id: 10 }),
        'ar'
      );
      expect(result).toEqual({ success: true, status: 200 });
    });

    it('marks the order failed and invalidates per-item caches on checkout.session.expired', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_2',
        type: 'checkout.session.expired',
        data: { object: { metadata: { order_id: '11' } } },
      });
      redisClient.get.mockResolvedValue(null);
      paymentRepo.markOrderFailed.mockResolvedValue({
        id: 11,
        items: [{ book_id: 1 }, { book_id: 2 }],
        user: { email: 'a@b.com', name: 'Ali', preferred_lang: 'ar' },
      });

      const result = await paymentService.handleWebhookEvent('raw-body', 'sig');

      expect(paymentRepo.markOrderFailed).toHaveBeenCalledWith(11);
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:1']);
      expect(redisClient.del).toHaveBeenCalledWith(['books:all', 'books:2']);
      expect(emailQueue.addPaymentFailedEmailJob).toHaveBeenCalled();
      expect(result).toEqual({ success: true, status: 200 });
    });

    it('marks the order refunded via the repository on charge.refunded', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_3',
        type: 'charge.refunded',
        data: { object: { payment_intent: 'pi_999' } },
      });
      redisClient.get.mockResolvedValue(null);
      refundRepo.markOrderRefundedFromWebhook.mockResolvedValue({ id: 12 });

      const result = await paymentService.handleWebhookEvent('raw-body', 'sig');

      expect(refundRepo.markOrderRefundedFromWebhook).toHaveBeenCalledWith('pi_999');
      expect(result).toEqual({ success: true, status: 200 });
    });

    it('acknowledges unhandled event types without touching the repositories', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_4', type: 'some.other.event' });
      redisClient.get.mockResolvedValue(null);

      const result = await paymentService.handleWebhookEvent('raw-body', 'sig');

      expect(paymentRepo.markOrderPaid).not.toHaveBeenCalled();
      expect(paymentRepo.markOrderFailed).not.toHaveBeenCalled();
      expect(refundRepo.markOrderRefundedFromWebhook).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, status: 200 });
    });
  });

  describe('expireStalePendingOrders', () => {
    it('does nothing when there are no stale orders', async () => {
      paymentRepo.findExpiredPendingOrdersByUser.mockResolvedValue([]);

      await paymentService.expireStalePendingOrders(5);

      expect(paymentRepo.markOrderFailed).not.toHaveBeenCalled();
    });

    it('expires the Stripe session and marks each stale order failed', async () => {
      paymentRepo.findExpiredPendingOrdersByUser.mockResolvedValue([
        { id: 1, stripe_session_id: 'sess_a' },
      ]);
      paymentRepo.markOrderFailed.mockResolvedValue({
        id: 1,
        items: [{ book_id: 1 }],
        user: { email: 'a@b.com', name: 'Ali', preferred_lang: 'ar' },
      });

      await paymentService.expireStalePendingOrders(5);

      expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith('sess_a');
      expect(paymentRepo.markOrderFailed).toHaveBeenCalledWith(1);
      expect(emailQueue.addPaymentFailedEmailJob).toHaveBeenCalled();
    });

    it('swallows errors so one failing order does not break the sweep', async () => {
      paymentRepo.findExpiredPendingOrdersByUser.mockRejectedValue(new Error('db down'));

      await expect(paymentService.expireStalePendingOrders(5)).resolves.toBeUndefined();
    });
  });
});