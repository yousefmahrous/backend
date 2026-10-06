import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/db.js', () => ({
  default: {
    vendorOrder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const prisma = (await import('../../core/db.js')).default;
const repo = await import('./vendor.order.repository.js');

describe('vendor.order.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findVendorOrders', () => {
    it("only returns this vendor's shipments of orders that were actually paid", async () => {
      prisma.vendorOrder.findMany.mockResolvedValue([]);
      prisma.vendorOrder.count.mockResolvedValue(0);

      await repo.findVendorOrders(7, 0, 20);

      const { where } = prisma.vendorOrder.findMany.mock.calls[0][0];
      expect(where).toEqual({ vendor_id: 7, order: { paid_at: { not: null } } });
      expect(prisma.vendorOrder.count).toHaveBeenCalledWith({ where });
    });

    it('adds the fulfillment status filter when given', async () => {
      prisma.vendorOrder.findMany.mockResolvedValue([]);
      prisma.vendorOrder.count.mockResolvedValue(0);

      await repo.findVendorOrders(7, 0, 20, 'shipped');

      expect(prisma.vendorOrder.findMany.mock.calls[0][0].where.fulfillment_status).toBe('shipped');
    });
  });

  describe('findVendorOrderById', () => {
    it("never looks up a shipment without scoping it to the vendor", async () => {
      prisma.vendorOrder.findFirst.mockResolvedValue(null);

      await repo.findVendorOrderById(3, 7);

      expect(prisma.vendorOrder.findFirst.mock.calls[0][0].where).toEqual({
        id: 3,
        vendor_id: 7,
        order: { paid_at: { not: null } },
      });
    });
  });

  describe('transitionFulfillment', () => {
    it('only updates when the status and the parent order are still what we expect', async () => {
      prisma.vendorOrder.updateMany.mockResolvedValue({ count: 1 });

      const ok = await repo.transitionFulfillment(3, 7, 'pending', { fulfillment_status: 'processing' });

      expect(ok).toBe(true);
      expect(prisma.vendorOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 3, vendor_id: 7, fulfillment_status: 'pending', order: { status: 'paid' } },
        data: { fulfillment_status: 'processing' },
      });
    });

    it('returns false when nothing matched', async () => {
      prisma.vendorOrder.updateMany.mockResolvedValue({ count: 0 });

      expect(await repo.transitionFulfillment(3, 7, 'pending', {})).toBe(false);
    });
  });
});