import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./refund.repository.js', () => ({
  findOrderForRefundRequest: vi.fn(),
  findActiveRefundRequest: vi.fn(),
  findRefundRequestsForVendor: vi.fn(),
  createRefundRequest: vi.fn(),
  findRefundRequestsForUser: vi.fn(),
  findAllRefundRequests: vi.fn(),
  findRefundRequestById: vi.fn(),
  approveRefundRequest: vi.fn(),
  rejectRefundRequest: vi.fn(),
  cancelAwaitingReturn: vi.fn(),
  completeRefund: vi.fn(),
  markOrderRefundedFromWebhook: vi.fn(),
}));

vi.mock('../../core/config/stripe.config.js', () => ({
  default: { refunds: { create: vi.fn() } },
}));

vi.mock('../../core/config/socket.config.js', () => ({
  getIO: vi.fn(() => {
    throw new Error('Socket.io is not initialized!');
  }),
}));

vi.mock('../../core/email.queue.js', () => ({
  addRefundStatusEmailJob: vi.fn(),
  addVendorReturnEmailJob: vi.fn(),
}));

const refundRepo = await import('./refund.repository.js');
const stripe = (await import('../../core/config/stripe.config.js')).default;
const { addVendorReturnEmailJob } = await import('../../core/email.queue.js');
const refundService = await import('./refund.service.js');

const t = fakeT;
const RETURN_WINDOW_DAYS = 14;

const shipment = (overrides = {}) => ({
  id: 3,
  return_status: null,
  items: [{ unit_price: 100, quantity: 2 }],
  ...overrides,
});
const makeOrder = (overrides = {}) => ({
  id: 1,
  status: 'paid',
  paid_at: daysAgo(1),
  vendorOrders: [shipment()],
  ...overrides,
});

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

describe('refund.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestRefund', () => {
    it('rejects an empty/whitespace-only reason without touching the repository', async () => {
      const result = await refundService.requestRefund(t, 'ar', 1, 5, '   ');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.reasonRequired' });
      expect(refundRepo.findOrderForRefundRequest).not.toHaveBeenCalled();
    });

    it('returns 404 when the order does not belong to this user or does not exist', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(null);

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 404, message: 'refund.orderNotFound' });
    });

    it('rejects orders that are not paid', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue({ id: 1, status: 'pending', paid_at: null });

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.orderNotEligible' });
    });

    it('rejects when an active refund request already exists for the order', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder());
      refundRepo.findActiveRefundRequest.mockResolvedValue({ id: 99, status: 'pending' });

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.activeRequestExists' });
      expect(refundRepo.createRefundRequest).not.toHaveBeenCalled();
    });

    it('rejects when the order has no paid_at timestamp', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder({ paid_at: null }));
      refundRepo.findActiveRefundRequest.mockResolvedValue(null);

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.paidAtMissing' });
    });

    it(`rejects requests made more than ${RETURN_WINDOW_DAYS} days after payment`, async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder({ paid_at: daysAgo(RETURN_WINDOW_DAYS + 1) }));
      refundRepo.findActiveRefundRequest.mockResolvedValue(null);

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toMatchObject({ success: false, status: 400 });
      expect(result.message).toContain('refund.windowExpired');
      expect(refundRepo.createRefundRequest).not.toHaveBeenCalled();
    });

    it('accepts a request made exactly at the boundary (still within the window)', async () => {
      // Paid slightly less than 14 days ago -> still inside the window.
      refundRepo.findOrderForRefundRequest.mockResolvedValue(
        makeOrder({ paid_at: new Date(daysAgo(RETURN_WINDOW_DAYS).getTime() + 60_000) })
      );
      refundRepo.findActiveRefundRequest.mockResolvedValue(null);
      refundRepo.createRefundRequest.mockResolvedValue({ id: 10, order_id: 1, status: 'pending', reason: 'damaged' });

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toMatchObject({ success: true, status: 201 });
    });

    it('trims the reason before saving it', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder());
      refundRepo.findActiveRefundRequest.mockResolvedValue(null);
      refundRepo.createRefundRequest.mockResolvedValue({ id: 10, order_id: 1, status: 'pending', reason: 'damaged' });

      await refundService.requestRefund(t, 'ar', 1, 5, '   damaged box   ');

      expect(refundRepo.createRefundRequest).toHaveBeenCalledWith(1, 5, 'damaged box', { id: 3, refund_amount: 200 });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      refundRepo.findOrderForRefundRequest.mockRejectedValue(new Error('db down'));

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 500, message: 'refund.submitError' });
    });
  });

  describe('requestRefund - choosing the vendor shipment', () => {
    beforeEach(() => {
      refundRepo.findActiveRefundRequest.mockResolvedValue(null);
      refundRepo.createRefundRequest.mockResolvedValue({ id: 10, order_id: 1, status: 'pending', reason: 'x' });
    });

    it('uses the only shipment of a single-vendor order without being told', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder());

      await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(refundRepo.createRefundRequest.mock.calls[0][3]).toEqual({ id: 3, refund_amount: 200 });
    });

    it('asks which shipment when the order has several', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(
        makeOrder({ vendorOrders: [shipment({ id: 3 }), shipment({ id: 4 })] })
      );

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.shipmentRequired' });
    });

    it('refunds only the chosen shipment, priced from its own items', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(
        makeOrder({
          vendorOrders: [shipment({ id: 3 }), shipment({ id: 4, items: [{ unit_price: 500, quantity: 1 }] })],
        })
      );

      await refundService.requestRefund(t, 'ar', 1, 5, 'damaged', 4);

      expect(refundRepo.createRefundRequest.mock.calls[0][3]).toEqual({ id: 4, refund_amount: 500 });
    });

    it('returns 404 for a shipment that is not part of this order', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder());

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged', 999);

      expect(result).toEqual({ success: false, status: 404, message: 'refund.shipmentNotFound' });
    });

    it('rejects a shipment that was already refunded', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(
        makeOrder({ vendorOrders: [shipment({ return_status: 'refunded' })] })
      );

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.alreadyRefunded' });
    });

    it('rejects a shipment that already has a return in progress', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(
        makeOrder({ vendorOrders: [shipment({ return_status: 'requested' })] })
      );

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.activeRequestExists' });
      expect(refundRepo.createRefundRequest).not.toHaveBeenCalled();
    });

    it('reports a conflict when another request claimed the shipment first', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder());
      refundRepo.createRefundRequest.mockResolvedValue(null);

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.activeRequestExists' });
    });
  });

  describe('vendor notifications and visibility', () => {
    const created = {
      id: 10,
      order_id: 1,
      status: 'pending',
      reason: 'x',
      refund_amount: 200,
      vendor_order: {
        id: 3,
        items: [],
        vendor: { id: 7, store_name: 'Cairo Products', owner: { name: 'Ali', email: 'ali@x.com', preferred_lang: 'en' } },
      },
    };

    beforeEach(() => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue(makeOrder());
      refundRepo.findActiveRefundRequest.mockResolvedValue(null);
      refundRepo.createRefundRequest.mockResolvedValue(created);
    });

    it('emails the vendor owner when a return is requested on their shipment', async () => {
      await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(addVendorReturnEmailJob).toHaveBeenCalledWith(
        'ali@x.com',
        'Ali',
        { order_id: 1, store_name: 'Cairo Products', amount: 200 },
        'en'
      );
    });

    it('does not leak the vendor owner (email) in the response', async () => {
      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result.data.shipment.vendor).toEqual({ id: 7, store_name: 'Cairo Products' });
    });

    it('still succeeds when queueing the email fails', async () => {
      addVendorReturnEmailJob.mockRejectedValue(new Error('redis down'));

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toMatchObject({ success: true, status: 201 });
    });

    it("lists a vendor's return requests without any customer information", async () => {
      refundRepo.findRefundRequestsForVendor.mockResolvedValue({
        requests: [
          {
            id: 1,
            order_id: 9,
            status: 'pending',
            reason: 'damaged',
            refund_amount: 200,
            created_at: 'c',
            reviewed_at: null,
            user: { id: 5, name: 'Customer', email: 'c@x.com' },
            vendor_order: { items: [{ product_id: 1, product: { title: { ar: 'كتاب', en: 'Product' } }, quantity: 2, unit_price: 100 }] },
          },
        ],
        totalCount: 1,
      });

      const result = await refundService.getVendorReturns(t, 'en', 7);

      expect(refundRepo.findRefundRequestsForVendor).toHaveBeenCalledWith(7, 0, 20);
      expect(result.data.items[0]).toEqual({
        id: 1,
        order_id: 9,
        status: 'pending',
        reason: 'damaged',
        refund_amount: 200,
        created_at: 'c',
        reviewed_at: null,
        items: [{ product_id: 1, title: 'Product', quantity: 2, unit_price: 100 }],
      });
    });
  });

  describe('completeRefund - Stripe amount', () => {
    it("refunds only the shipment's amount for a per-shipment request", async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({
        id: 2,
        status: 'awaiting_return',
        vendor_order_id: 3,
        refund_amount: 200,
        order: { payment_intent_id: 'pi_123' },
      });
      stripe.refunds.create.mockResolvedValue({ id: 're_1' });
      refundRepo.completeRefund.mockResolvedValue({ id: 2, status: 'completed', user: null });

      await refundService.completeRefund(t, 'ar', 2);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_123', amount: 200 },
        { idempotencyKey: 'refund-request-2' }
      );
    });
  });

  describe('approveRefundRequest', () => {
    it('returns 404 when the request does not exist', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue(null);

      const result = await refundService.approveRefundRequest(t, 'ar', 1);

      expect(result).toEqual({ success: false, status: 404, message: 'refund.requestNotFound' });
    });

    it('refuses to re-approve a request that already left the "pending" state', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'completed' });

      const result = await refundService.approveRefundRequest(t, 'ar', 1);

      expect(result).toEqual({ success: false, status: 400, message: 'refund.alreadyReviewed' });
      expect(refundRepo.approveRefundRequest).not.toHaveBeenCalled();
    });

    it('approves a pending request', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'pending' });
      refundRepo.approveRefundRequest.mockResolvedValue({ id: 1, status: 'awaiting_return' });

      const result = await refundService.approveRefundRequest(t, 'ar', 1);

      expect(refundRepo.approveRefundRequest).toHaveBeenCalledWith(1);
      expect(result).toMatchObject({ success: true, status: 200 });
    });
  });

  describe('completeRefund (the Stripe-refunding step)', () => {
    it('returns 404 when the request does not exist', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue(null);

      const result = await refundService.completeRefund(t, 'ar', 1);

      expect(result).toEqual({ success: false, status: 404, message: 'refund.requestNotFound' });
    });

    it('refuses to complete a request that was never approved (still pending)', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'pending' });

      const result = await refundService.completeRefund(t, 'ar', 1);

      expect(result).toEqual({ success: false, status: 400, message: 'refund.notApprovedYet' });
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('refuses when the order has no Stripe payment_intent_id on file', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({
        id: 1,
        status: 'awaiting_return',
        order: { payment_intent_id: null },
      });

      const result = await refundService.completeRefund(t, 'ar', 1);

      expect(result).toEqual({ success: false, status: 400, message: 'refund.paymentIntentMissing' });
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('returns 502 and does NOT touch the database when Stripe rejects the refund', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({
        id: 1,
        status: 'awaiting_return',
        order: { payment_intent_id: 'pi_123' },
      });
      stripe.refunds.create.mockRejectedValue(new Error('card issuer declined'));

      const result = await refundService.completeRefund(t, 'ar', 1);

      expect(result).toEqual({ success: false, status: 502, message: 'refund.stripeFailed' });
      expect(refundRepo.completeRefund).not.toHaveBeenCalled();
    });

    it('refunds via Stripe with the correct payment_intent and persists the result on success', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({
        id: 1,
        status: 'awaiting_return',
        order: { payment_intent_id: 'pi_123' },
      });
      stripe.refunds.create.mockResolvedValue({ id: 're_123' });
      refundRepo.completeRefund.mockResolvedValue({ id: 1, status: 'completed', user: null });

      const result = await refundService.completeRefund(t, 'ar', 1);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_123' },
        { idempotencyKey: 'refund-request-1' }
      );
      expect(refundRepo.completeRefund).toHaveBeenCalledWith(1);
      expect(result).toMatchObject({ success: true, status: 200 });
    });
  });

  describe('rejectRefundRequest', () => {
    it('returns 404 when the request does not exist', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue(null);

      const result = await refundService.rejectRefundRequest(t, 'ar', 1, 'not eligible');

      expect(result).toEqual({ success: false, status: 404, message: 'refund.requestNotFound' });
      expect(refundRepo.rejectRefundRequest).not.toHaveBeenCalled();
    });

    it('refuses to reject a request that already left the "pending" state', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'awaiting_return' });

      const result = await refundService.rejectRefundRequest(t, 'ar', 1, 'not eligible');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.alreadyReviewed' });
      expect(refundRepo.rejectRefundRequest).not.toHaveBeenCalled();
    });

    it('rejects a pending request with the given admin note and queues the status email', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'pending' });
      refundRepo.rejectRefundRequest.mockResolvedValue({
        id: 1,
        status: 'rejected',
        admin_note: 'not eligible',
        user: { email: 'a@b.com', name: 'Ali', preferred_lang: 'ar' },
      });

      const result = await refundService.rejectRefundRequest(t, 'ar', 1, 'not eligible');

      expect(refundRepo.rejectRefundRequest).toHaveBeenCalledWith(1, 'not eligible');
      expect(result).toMatchObject({ success: true, status: 200, message: 'refund.rejectedMessage' });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      refundRepo.findRefundRequestById.mockRejectedValue(new Error('db down'));

      const result = await refundService.rejectRefundRequest(t, 'ar', 1, 'not eligible');

      expect(result).toEqual({ success: false, status: 500, message: 'refund.rejectError' });
    });
  });

  describe('cancelAwaitingReturn', () => {
    it('returns 404 when the request does not exist', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue(null);

      const result = await refundService.cancelAwaitingReturn(t, 'ar', 1, 'buyer kept the item');

      expect(result).toEqual({ success: false, status: 404, message: 'refund.requestNotFound' });
      expect(refundRepo.cancelAwaitingReturn).not.toHaveBeenCalled();
    });

    it('refuses to cancel a request that is not currently "awaiting_return"', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'pending' });

      const result = await refundService.cancelAwaitingReturn(t, 'ar', 1, 'buyer kept the item');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.notAwaitingReturn' });
      expect(refundRepo.cancelAwaitingReturn).not.toHaveBeenCalled();
    });

    it('cancels an "awaiting_return" request with the given admin note and queues the status email', async () => {
      refundRepo.findRefundRequestById.mockResolvedValue({ id: 1, status: 'awaiting_return' });
      refundRepo.cancelAwaitingReturn.mockResolvedValue({
        id: 1,
        status: 'cancelled',
        admin_note: 'buyer kept the item',
        user: { email: 'a@b.com', name: 'Ali', preferred_lang: 'ar' },
      });

      const result = await refundService.cancelAwaitingReturn(t, 'ar', 1, 'buyer kept the item');

      expect(refundRepo.cancelAwaitingReturn).toHaveBeenCalledWith(1, 'buyer kept the item');
      expect(result).toMatchObject({ success: true, status: 200, message: 'refund.cancelledMessage' });
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      refundRepo.findRefundRequestById.mockRejectedValue(new Error('db down'));

      const result = await refundService.cancelAwaitingReturn(t, 'ar', 1, 'buyer kept the item');

      expect(result).toEqual({ success: false, status: 500, message: 'refund.cancelError' });
    });
  });
});