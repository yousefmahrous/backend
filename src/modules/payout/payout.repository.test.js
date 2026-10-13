import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/db.js', () => ({
  default: {
    vendorOrder: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    payout: { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    vendor: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const prisma = (await import('../../core/db.js')).default;
const repo = await import('./payout.repository.js');

const CUTOFF = new Date('2026-10-04T12:00:00Z');

describe('payout.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.vendorOrder.aggregate.mockResolvedValue({ _sum: { net_amount: 0 } });
    prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  });

  describe('getEarningsTotals', () => {
    it('queries three money buckets, each scoped to the vendor and to unpaid-out money', async () => {
      await repo.getEarningsTotals(7, CUTOFF);

      const wheres = prisma.vendorOrder.aggregate.mock.calls.map(([arg]) => arg.where);
      expect(wheres).toHaveLength(3);
      for (const where of wheres) {
        expect(where).toMatchObject({ vendor_id: 7, payout_id: null, gross_amount: { not: null } });
        // every bucket requires a real payment date (`not null` or a `lte` date, which implies it)
        expect(where.order.paid_at).toBeDefined();
      }
    });

    it('counts available money only for delivered shipments whose return window (from payment) has closed', async () => {
      await repo.getEarningsTotals(7, CUTOFF);

      const available = prisma.vendorOrder.aggregate.mock.calls[1][0].where;
      expect(available).toMatchObject({
        fulfillment_status: 'delivered',
        order: { status: 'paid', paid_at: { lte: CUTOFF } },
      });
    });

    it('puts everything else on a paid order into pending (NOT matured)', async () => {
      await repo.getEarningsTotals(7, CUTOFF);

      const pending = prisma.vendorOrder.aggregate.mock.calls[0][0].where;
      expect(pending.order.status).toBe('paid');
      expect(pending.NOT).toEqual({
        fulfillment_status: 'delivered',
        order: { paid_at: { lte: CUTOFF } },
      });
    });

    it('freezes money on shipments with an open return, requested or approved', async () => {
      await repo.getEarningsTotals(7, CUTOFF);

      expect(prisma.vendorOrder.aggregate.mock.calls[2][0].where.return_status).toEqual({
        in: ['requested', 'approved'],
      });
    });

    it('never counts a shipment with any return state as pending or available', async () => {
      await repo.getEarningsTotals(7, CUTOFF);

      expect(prisma.vendorOrder.aggregate.mock.calls[0][0].where.return_status).toBeNull();
      expect(prisma.vendorOrder.aggregate.mock.calls[1][0].where.return_status).toBeNull();
    });

    it('takes the paid-out total from the payouts table and defaults empty sums to 0', async () => {
      prisma.vendorOrder.aggregate
        .mockResolvedValueOnce({ _sum: { net_amount: 100 } })
        .mockResolvedValueOnce({ _sum: { net_amount: null } })
        .mockResolvedValueOnce({ _sum: { net_amount: 30 } });
      prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 500 } });

      const totals = await repo.getEarningsTotals(7, CUTOFF);

      expect(totals).toEqual({ pending: 100, available: 0, onHold: 30, paidOut: 500 });
      expect(prisma.payout.aggregate).toHaveBeenCalledWith({ _sum: { amount: true }, where: { vendor_id: 7 } });
    });
  });

  describe('findPayoutsByVendor', () => {
    it("only lists this vendor's payouts, newest first", async () => {
      prisma.payout.findMany.mockResolvedValue([]);
      prisma.payout.count.mockResolvedValue(0);

      await repo.findPayoutsByVendor(7, 20, 10);

      expect(prisma.payout.findMany).toHaveBeenCalledWith({
        where: { vendor_id: 7 },
        orderBy: { created_at: 'desc' },
        skip: 20,
        take: 10,
        include: { _count: { select: { vendorOrders: true } } },
      });
    });
  });

  describe('getAllVendorBalances', () => {
    it('merges the grouped totals onto every non-platform vendor, defaulting to 0', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 1, store_name: 'A', status: 'active' },
        { id: 2, store_name: 'B', status: 'active' },
      ]);
      prisma.vendorOrder.groupBy
        .mockResolvedValueOnce([{ vendor_id: 1, _sum: { net_amount: 100 } }]) // pending
        .mockResolvedValueOnce([{ vendor_id: 1, _sum: { net_amount: 200 } }]) // available
        .mockResolvedValueOnce([]); // on hold
      prisma.payout.groupBy.mockResolvedValue([{ vendor_id: 2, _sum: { amount: 300 } }]);

      const rows = await repo.getAllVendorBalances(CUTOFF);

      expect(prisma.vendor.findMany.mock.calls[0][0].where).toEqual({ is_platform: false });
      expect(rows).toEqual([
        { vendor: { id: 1, store_name: 'A', status: 'active' }, pending: 100, available: 200, onHold: 0, paidOut: 0 },
        { vendor: { id: 2, store_name: 'B', status: 'active' }, pending: 0, available: 0, onHold: 0, paidOut: 300 },
      ]);
    });

    it('groups by vendor without scoping the buckets to a single vendor', async () => {
      prisma.vendor.findMany.mockResolvedValue([]);
      prisma.vendorOrder.groupBy.mockResolvedValue([]);
      prisma.payout.groupBy.mockResolvedValue([]);

      await repo.getAllVendorBalances(CUTOFF);

      const [{ by, where }] = prisma.vendorOrder.groupBy.mock.calls[0];
      expect(by).toEqual(['vendor_id']);
      expect(where.vendor_id).toBeUndefined();
      expect(where.payout_id).toBeNull();
    });
  });

  describe('createPayoutForVendor', () => {
    const input = { reference: 'TRX-1', note: undefined, adminId: 99 };
    let tx;

    beforeEach(() => {
      tx = {
        vendorOrder: { findMany: vi.fn(), updateMany: vi.fn() },
        payout: { create: vi.fn() },
      };
      prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    });

    it('pays out the sum of the available shipments and stamps exactly those shipments', async () => {
      tx.vendorOrder.findMany.mockResolvedValue([
        { id: 10, net_amount: 9000 },
        { id: 11, net_amount: 4500 },
      ]);
      tx.payout.create.mockResolvedValue({ id: 5, amount: 13500, reference: 'TRX-1' });
      tx.vendorOrder.updateMany.mockResolvedValue({ count: 2 });

      const result = await repo.createPayoutForVendor(7, CUTOFF, input);

      expect(tx.payout.create).toHaveBeenCalledWith({
        data: { vendor_id: 7, amount: 13500, reference: 'TRX-1', note: null, created_by_id: 99 },
      });
      const stamp = tx.vendorOrder.updateMany.mock.calls[0][0];
      expect(stamp.where.id).toEqual({ in: [10, 11] });
      expect(stamp.where.payout_id).toBeNull();
      expect(stamp.where.vendor_id).toBe(7);
      expect(stamp.data).toEqual({ payout_id: 5 });
      expect(result).toEqual({ payout: { id: 5, amount: 13500, reference: 'TRX-1' }, ordersCount: 2 });
    });

    it('reports NOTHING_AVAILABLE without creating anything', async () => {
      tx.vendorOrder.findMany.mockResolvedValue([]);

      const result = await repo.createPayoutForVendor(7, CUTOFF, input);

      expect(result).toEqual({ error: 'NOTHING_AVAILABLE' });
      expect(tx.payout.create).not.toHaveBeenCalled();
    });

    it('does not create a zero-amount payout', async () => {
      tx.vendorOrder.findMany.mockResolvedValue([{ id: 10, net_amount: 0 }]);

      const result = await repo.createPayoutForVendor(7, CUTOFF, input);

      expect(result).toEqual({ error: 'NOTHING_AVAILABLE' });
    });

    it('rolls back and reports CONFLICT if a shipment changed before it could be stamped', async () => {
      tx.vendorOrder.findMany.mockResolvedValue([
        { id: 10, net_amount: 9000 },
        { id: 11, net_amount: 4500 },
      ]);
      tx.payout.create.mockResolvedValue({ id: 5, amount: 13500 });
      tx.vendorOrder.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.createPayoutForVendor(7, CUTOFF, input);

      expect(result).toEqual({ error: 'CONFLICT' });
    });

    it('lets unexpected errors bubble up', async () => {
      tx.vendorOrder.findMany.mockRejectedValue(new Error('db down'));

      await expect(repo.createPayoutForVendor(7, CUTOFF, input)).rejects.toThrow('db down');
    });
  });

  describe('findAllPayouts', () => {
    it('lists payouts across vendors with the vendor name and order count', async () => {
      prisma.payout.findMany.mockResolvedValue([]);
      prisma.payout.count.mockResolvedValue(0);

      await repo.findAllPayouts(0, 20);

      expect(prisma.payout.findMany.mock.calls[0][0].include).toEqual({
        vendor: { select: { id: true, store_name: true } },
        _count: { select: { vendorOrders: true } },
      });
    });
  });
});