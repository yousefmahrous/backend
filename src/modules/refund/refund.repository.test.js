import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  refundRequest: { findUnique: vi.fn(), update: vi.fn() },
  order: { findUnique: vi.fn(), update: vi.fn() },
  productVariant: { updateMany: vi.fn() },
};

vi.mock('../../core/db.js', () => ({
  default: {
    $transaction: vi.fn((cb) => cb(tx)),
  },
}));

vi.mock('../../core/config/redis.client.js', () => ({
  default: { del: vi.fn() },
}));

const prisma = (await import('../../core/db.js')).default;
const refundRepo = await import('./refund.repository.js');

describe('refund.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  describe('completeRefund', () => {
    it("returns every refunded book's stock to its variant, not the stale book column", async () => {
      tx.refundRequest.findUnique.mockResolvedValue({
        id: 1,
        order_id: 7,
        order: { items: [{ book_id: 1, quantity: 2 }, { book_id: 2, quantity: 1 }] },
        user: { id: 5 },
      });
      tx.refundRequest.update.mockResolvedValue({ id: 1, status: 'completed' });

      await refundRepo.completeRefund(1);

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 1 },
        data: { stock: { increment: 2 } },
      });
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 2 },
        data: { stock: { increment: 1 } },
      });
    });

    it('returns null and touches nothing when the request does not exist', async () => {
      tx.refundRequest.findUnique.mockResolvedValue(null);

      const result = await refundRepo.completeRefund(999);

      expect(result).toBeNull();
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markOrderRefundedFromWebhook', () => {
    it("returns every item's stock to its variant, not the stale book column", async () => {
      tx.order.findUnique.mockResolvedValue({
        id: 7,
        status: 'paid',
        items: [{ book_id: 3, quantity: 4 }],
        refundRequests: [],
      });

      await refundRepo.markOrderRefundedFromWebhook('pi_123');

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 3 },
        data: { stock: { increment: 4 } },
      });
    });

    it('does nothing when the order is already refunded (avoids double-crediting stock)', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 7, status: 'refunded', items: [], refundRequests: [] });

      const result = await refundRepo.markOrderRefundedFromWebhook('pi_123');

      expect(result).toBeNull();
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when no order matches the payment intent', async () => {
      tx.order.findUnique.mockResolvedValue(null);

      const result = await refundRepo.markOrderRefundedFromWebhook('pi_missing');

      expect(result).toBeNull();
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });
  });
});