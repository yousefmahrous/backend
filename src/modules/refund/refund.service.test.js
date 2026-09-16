import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./refund.repository.js', () => ({
  findOrderForRefundRequest: vi.fn(),
  findActiveRefundRequestForOrder: vi.fn(),
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
}));

const refundRepo = await import('./refund.repository.js');
const stripe = (await import('../../core/config/stripe.config.js')).default;
const refundService = await import('./refund.service.js');

const t = fakeT;
const RETURN_WINDOW_DAYS = 14;

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
      refundRepo.findOrderForRefundRequest.mockResolvedValue({ id: 1, status: 'paid', paid_at: daysAgo(1) });
      refundRepo.findActiveRefundRequestForOrder.mockResolvedValue({ id: 99, status: 'pending' });

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.activeRequestExists' });
      expect(refundRepo.createRefundRequest).not.toHaveBeenCalled();
    });

    it('rejects when the order has no paid_at timestamp', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue({ id: 1, status: 'paid', paid_at: null });
      refundRepo.findActiveRefundRequestForOrder.mockResolvedValue(null);

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 400, message: 'refund.paidAtMissing' });
    });

    it(`rejects requests made more than ${RETURN_WINDOW_DAYS} days after payment`, async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue({
        id: 1,
        status: 'paid',
        paid_at: daysAgo(RETURN_WINDOW_DAYS + 1),
      });
      refundRepo.findActiveRefundRequestForOrder.mockResolvedValue(null);

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toMatchObject({ success: false, status: 400 });
      expect(result.message).toContain('refund.windowExpired');
      expect(refundRepo.createRefundRequest).not.toHaveBeenCalled();
    });

    it('accepts a request made exactly at the boundary (still within the window)', async () => {
      // Paid slightly less than 14 days ago -> still inside the window.
      refundRepo.findOrderForRefundRequest.mockResolvedValue({
        id: 1,
        status: 'paid',
        paid_at: new Date(daysAgo(RETURN_WINDOW_DAYS).getTime() + 60_000),
      });
      refundRepo.findActiveRefundRequestForOrder.mockResolvedValue(null);
      refundRepo.createRefundRequest.mockResolvedValue({ id: 10, order_id: 1, status: 'pending', reason: 'damaged' });

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toMatchObject({ success: true, status: 201 });
    });

    it('trims the reason before saving it', async () => {
      refundRepo.findOrderForRefundRequest.mockResolvedValue({ id: 1, status: 'paid', paid_at: daysAgo(1) });
      refundRepo.findActiveRefundRequestForOrder.mockResolvedValue(null);
      refundRepo.createRefundRequest.mockResolvedValue({ id: 10, order_id: 1, status: 'pending', reason: 'damaged' });

      await refundService.requestRefund(t, 'ar', 1, 5, '   damaged box   ');

      expect(refundRepo.createRefundRequest).toHaveBeenCalledWith(1, 5, 'damaged box');
    });

    it('returns a 500 when the repository throws unexpectedly', async () => {
      refundRepo.findOrderForRefundRequest.mockRejectedValue(new Error('db down'));

      const result = await refundService.requestRefund(t, 'ar', 1, 5, 'damaged');

      expect(result).toEqual({ success: false, status: 500, message: 'refund.submitError' });
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

      expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_123' });
      expect(refundRepo.completeRefund).toHaveBeenCalledWith(1);
      expect(result).toMatchObject({ success: true, status: 200 });
    });
  });
});
