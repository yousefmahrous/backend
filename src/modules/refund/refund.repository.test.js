import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
  refundRequest: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  order: { findUnique: vi.fn(), update: vi.fn() },
  vendorOrder: { updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  productVariant: { updateMany: vi.fn() },
};

vi.mock('../../core/db.js', () => ({
  default: {
    $transaction: vi.fn((cb) => cb(tx)),
    refundRequest: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../core/config/redis.client.js', () => ({
  default: { del: vi.fn() },
}));

const prisma = (await import('../../core/db.js')).default;
const refundRepo = await import('./refund.repository.js');

const items = (...pairs) => pairs.map(([product_id, quantity]) => ({ product_id, quantity }));

describe('refund.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((cb) => cb(tx));
  });

  describe('createRefundRequest', () => {
    it('claims the shipment with a compare-and-set and links the request to it', async () => {
      tx.vendorOrder.updateMany.mockResolvedValue({ count: 1 });
      tx.refundRequest.create.mockResolvedValue({ id: 10 });

      await refundRepo.createRefundRequest(7, 5, 'damaged', { id: 3, refund_amount: 200 });

      expect(tx.vendorOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 3, return_status: null },
        data: { return_status: 'requested' },
      });
      expect(tx.refundRequest.create.mock.calls[0][0].data).toEqual({
        order_id: 7,
        user_id: 5,
        reason: 'damaged',
        vendor_order_id: 3,
        refund_amount: 200,
      });
      expect(tx.order.update).not.toHaveBeenCalled(); // the other vendors' shipments stay untouched
    });

    it('returns null and creates nothing when the shipment already has a return in progress', async () => {
      tx.vendorOrder.updateMany.mockResolvedValue({ count: 0 });

      const result = await refundRepo.createRefundRequest(7, 5, 'damaged', { id: 3, refund_amount: 200 });

      expect(result).toBeNull();
      expect(tx.refundRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('findRefundRequestsForVendor', () => {
    it("only lists requests on this vendor's shipments", async () => {
      prisma.refundRequest.findMany.mockResolvedValue([]);
      prisma.refundRequest.count.mockResolvedValue(0);

      await refundRepo.findRefundRequestsForVendor(7, 0, 20);

      expect(prisma.refundRequest.findMany.mock.calls[0][0].where).toEqual({ vendor_order: { vendor_id: 7 } });
      expect(prisma.refundRequest.count).toHaveBeenCalledWith({ where: { vendor_order: { vendor_id: 7 } } });
    });
  });

  describe('approve / reject', () => {
    it('approving moves only the requested shipment to approved', async () => {
      tx.refundRequest.update.mockResolvedValue({ id: 1, order_id: 7, vendor_order_id: 3 });

      await refundRepo.approveRefundRequest(1);

      expect(tx.vendorOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 3, return_status: { in: ['requested'] } },
        data: { return_status: 'approved' },
      });
    });

    it('rejecting unfreezes the shipment by clearing its return state', async () => {
      tx.refundRequest.update.mockResolvedValue({ id: 1, order_id: 7, vendor_order_id: 3 });

      await refundRepo.rejectRefundRequest(1, 'not eligible');

      expect(tx.vendorOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 3, return_status: { in: ['requested', 'approved'] } },
        data: { return_status: null },
      });
    });

    it('a legacy whole-order request touches every shipment of the order', async () => {
      tx.refundRequest.update.mockResolvedValue({ id: 1, order_id: 7, vendor_order_id: null });

      await refundRepo.cancelAwaitingReturn(1);

      expect(tx.vendorOrder.updateMany.mock.calls[0][0].where).toEqual({
        order_id: 7,
        return_status: { in: ['requested', 'approved'] },
      });
    });
  });

  describe('completeRefund', () => {
    const request = (overrides = {}) => ({
      id: 1,
      order_id: 7,
      vendor_order_id: 3,
      order: { id: 7, items: items([1, 2], [2, 1]) },
      user: { id: 5 },
      ...overrides,
    });

    beforeEach(() => {
      tx.refundRequest.update.mockResolvedValue({ id: 1, status: 'completed' });
    });

    it("refunds the shipment and returns ITS items' stock to the variants, not the stale product column", async () => {
      tx.refundRequest.findUnique.mockResolvedValue(request());
      tx.vendorOrder.findMany.mockResolvedValue([{ id: 3, items: items([1, 2], [2, 1]) }]);
      tx.vendorOrder.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      await refundRepo.completeRefund(1);

      expect(tx.vendorOrder.updateMany.mock.calls[0][0].data.return_status).toBe('refunded');
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 1 },
        data: { stock: { increment: 2 } },
      });
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 2 },
        data: { stock: { increment: 1 } },
      });
    });

    it("only restocks the refunded vendor's products, not the other vendors' in the same order", async () => {
      tx.refundRequest.findUnique.mockResolvedValue(request());
      tx.vendorOrder.findMany.mockResolvedValue([{ id: 3, items: items([1, 2]) }]);
      tx.vendorOrder.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      await refundRepo.completeRefund(1);

      expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.productVariant.updateMany.mock.calls[0][0].where.product_id).toBe(1);
    });

    it('leaves the order "paid" while another shipment of it is still not refunded', async () => {
      tx.refundRequest.findUnique.mockResolvedValue(request());
      tx.vendorOrder.findMany.mockResolvedValue([{ id: 3, items: items([1, 2]) }]);
      tx.vendorOrder.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      await refundRepo.completeRefund(1);

      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('marks the order refunded once its last shipment is refunded', async () => {
      tx.refundRequest.findUnique.mockResolvedValue(request());
      tx.vendorOrder.findMany.mockResolvedValue([{ id: 3, items: items([1, 2]) }]);
      tx.vendorOrder.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

      await refundRepo.completeRefund(1);

      expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'refunded' } });
    });

    it('never restocks twice: an already-refunded shipment adds nothing back', async () => {
      tx.refundRequest.findUnique.mockResolvedValue(request());
      tx.vendorOrder.findMany.mockResolvedValue([]); // the only shipment is already refunded
      tx.vendorOrder.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await refundRepo.completeRefund(1);

      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });

    it('a legacy whole-order request refunds every shipment of the order', async () => {
      tx.refundRequest.findUnique.mockResolvedValue(request({ vendor_order_id: null }));
      tx.vendorOrder.findMany.mockResolvedValue([
        { id: 3, items: items([1, 2]) },
        { id: 4, items: items([2, 1]) },
      ]);
      tx.vendorOrder.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

      await refundRepo.completeRefund(1);

      expect(tx.vendorOrder.findMany.mock.calls[0][0].where.id).toBeUndefined();
      expect(tx.vendorOrder.updateMany.mock.calls[0][0].where).toEqual({ id: { in: [3, 4] } });
      expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(2);
    });

    it('returns null and touches nothing when the request does not exist', async () => {
      tx.refundRequest.findUnique.mockResolvedValue(null);

      const result = await refundRepo.completeRefund(999);

      expect(result).toBeNull();
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markOrderRefundedFromWebhook', () => {
    it("returns the stock of the shipments that weren't refunded yet, and closes open requests", async () => {
      tx.order.findUnique.mockResolvedValue({ id: 7, status: 'paid', items: items([3, 4]) });
      tx.vendorOrder.findMany.mockResolvedValue([{ id: 3, items: items([3, 4]) }]);
      tx.vendorOrder.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await refundRepo.markOrderRefundedFromWebhook('pi_123');

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { product_id: 3 },
        data: { stock: { increment: 4 } },
      });
      expect(tx.refundRequest.updateMany).toHaveBeenCalledWith({
        where: { order_id: 7, status: { in: ['pending', 'awaiting_return'] } },
        data: expect.objectContaining({ status: 'completed' }),
      });
    });

    it('does nothing when the order is already refunded (avoids double-crediting stock)', async () => {
      tx.order.findUnique.mockResolvedValue({ id: 7, status: 'refunded', items: [] });

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