import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/db.js', () => ({
  default: {
    vendorOrder: { findMany: vi.fn(), groupBy: vi.fn() },
    vendor: { groupBy: vi.fn() },
    refundRequest: { count: vi.fn() }
  }
}));

const prisma = (await import('../../core/db.js')).default;
const repo = await import('./vendor.analytics.repository.js');

describe('vendor.analytics.repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes shipments to this vendor and to orders paid since the cutoff', async () => {
    prisma.vendorOrder.findMany.mockResolvedValue([]);
    const since = new Date('2026-10-01T00:00:00Z');
    await repo.findPaidVendorOrdersSince(7, since);
    expect(prisma.vendorOrder.findMany.mock.calls[0][0].where).toEqual({
      vendor_id: 7,
      order: { paid_at: { gte: since } }
    });
  });

  it('maps grouped fulfillment counts', async () => {
    prisma.vendorOrder.groupBy.mockResolvedValue([{ fulfillment_status: 'pending', _count: { _all: 4 } }]);
    expect(await repo.countFulfillmentByStatus(7)).toEqual([{ status: 'pending', count: 4 }]);
    expect(prisma.vendorOrder.groupBy.mock.calls[0][0].where).toEqual({
      vendor_id: 7,
      order: { paid_at: { not: null } }
    });
  });

  it('counts fulfillment across the whole platform when no vendor is given', async () => {
    prisma.vendorOrder.groupBy.mockResolvedValue([]);
    await repo.countFulfillmentByStatus();
    expect(prisma.vendorOrder.groupBy.mock.calls[0][0].where).toEqual({ order: { paid_at: { not: null } } });
  });

  it('fetches every vendor shipment of orders paid since the cutoff', async () => {
    prisma.vendorOrder.findMany.mockResolvedValue([]);
    const since = new Date('2026-10-01T00:00:00Z');
    await repo.findAllPaidVendorOrdersSince(since);
    expect(prisma.vendorOrder.findMany.mock.calls[0][0].where).toEqual({ order: { paid_at: { gte: since } } });
  });

  it('counts vendors by status excluding the platform store', async () => {
    prisma.vendor.groupBy.mockResolvedValue([{ status: 'active', _count: { _all: 2 } }]);
    expect(await repo.countVendorsByStatus()).toEqual([{ status: 'active', count: 2 }]);
    expect(prisma.vendor.groupBy.mock.calls[0][0].where).toEqual({ is_platform: false });
  });

  it('counts only pending refund requests', async () => {
    prisma.refundRequest.count.mockResolvedValue(4);
    expect(await repo.countPendingRefundRequests()).toBe(4);
    expect(prisma.refundRequest.count).toHaveBeenCalledWith({ where: { status: 'pending' } });
  });
});
