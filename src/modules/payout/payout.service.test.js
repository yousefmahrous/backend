import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./payout.repository.js', () => ({
  getEarningsTotals: vi.fn(),
  findPayoutsByVendor: vi.fn(),
  getAllVendorBalances: vi.fn(),
  findVendorForPayout: vi.fn(),
  createPayoutForVendor: vi.fn(),
  findAllPayouts: vi.fn(),
}));
vi.mock('../settings/settings.repository.js', () => ({
  getSettingValue: vi.fn(),
}));

const payoutRepo = await import('./payout.repository.js');
const settingsRepo = await import('../settings/settings.repository.js');
const service = await import('./payout.service.js');

const t = fakeT;
const NOW = new Date('2026-10-11T12:00:00Z');
const vendor = { id: 7, is_platform: false, commission_bps: null };

describe('payout.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    settingsRepo.getSettingValue.mockImplementation(async (key) =>
      key === 'default_commission_bps' ? 1000 : undefined
    );
    payoutRepo.getEarningsTotals.mockResolvedValue({ pending: 100, available: 200, onHold: 50, paidOut: 300 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getEarnings', () => {
    it('returns the four buckets, the hold period and the effective commission rate', async () => {
      const result = await service.getEarnings(t, vendor);

      expect(result).toEqual({
        success: true,
        status: 200,
        data: {
          currency: 'egp',
          pending: 100,
          available: 200,
          on_hold: 50,
          paid_out: 300,
          hold_days: 14,
          commission_bps: 1000,
        },
      });
    });

    it('treats money as available only after the return window (cutoff = now - hold days)', async () => {
      await service.getEarnings(t, vendor);

      const [vendorId, cutoff] = payoutRepo.getEarningsTotals.mock.calls[0];
      expect(vendorId).toBe(7);
      expect(cutoff).toEqual(new Date('2026-09-27T12:00:00Z'));
    });

    it('uses the hold days from the platform settings when valid', async () => {
      settingsRepo.getSettingValue.mockImplementation(async (key) =>
        key === 'payout_hold_days' ? 30 : 1000
      );

      const result = await service.getEarnings(t, vendor);

      expect(result.data.hold_days).toBe(30);
      expect(payoutRepo.getEarningsTotals.mock.calls[0][1]).toEqual(new Date('2026-09-11T12:00:00Z'));
    });

    it('shows the vendor their own commission rate when they have one', async () => {
      const result = await service.getEarnings(t, { ...vendor, commission_bps: 500 });

      expect(result.data.commission_bps).toBe(500);
    });

    it('returns a 500 when something throws', async () => {
      payoutRepo.getEarningsTotals.mockRejectedValue(new Error('db down'));

      const result = await service.getEarnings(t, vendor);

      expect(result).toEqual({ success: false, status: 500, message: 'vendor.earnings.loadError' });
    });
  });

  describe('getMyPayouts', () => {
    it('serializes payouts with the number of orders they covered', async () => {
      payoutRepo.findPayoutsByVendor.mockResolvedValue({
        payouts: [
          {
            id: 1,
            amount: 90000,
            currency: 'egp',
            reference: 'TRX-1',
            note: null,
            created_at: 'c',
            created_by_id: 99,
            _count: { vendorOrders: 3 },
          },
        ],
        totalCount: 1,
      });

      const result = await service.getMyPayouts(t, 7);

      expect(payoutRepo.findPayoutsByVendor).toHaveBeenCalledWith(7, 0, 20);
      expect(result.data.items).toEqual([
        { id: 1, amount: 90000, currency: 'egp', reference: 'TRX-1', note: null, created_at: 'c', orders_count: 3 },
      ]);
      expect(result.data.pagination.totalPages).toBe(1);
    });

    it('returns a 500 when something throws', async () => {
      payoutRepo.findPayoutsByVendor.mockRejectedValue(new Error('db down'));

      const result = await service.getMyPayouts(t, 7);

      expect(result).toEqual({ success: false, status: 500, message: 'vendor.payouts.loadError' });
    });
  });

  describe('getVendorBalances', () => {
    it('sorts vendors by available balance, highest first, and renames onHold', async () => {
      payoutRepo.getAllVendorBalances.mockResolvedValue([
        { vendor: { id: 1 }, pending: 0, available: 100, onHold: 5, paidOut: 0 },
        { vendor: { id: 2 }, pending: 0, available: 900, onHold: 0, paidOut: 50 },
      ]);

      const result = await service.getVendorBalances(t);

      expect(result.data.items.map((i) => i.vendor.id)).toEqual([2, 1]);
      expect(result.data.items[1]).toMatchObject({ on_hold: 5, paid_out: 0 });
      expect(result.data.hold_days).toBe(14);
      expect(payoutRepo.getAllVendorBalances).toHaveBeenCalledWith(new Date('2026-09-27T12:00:00Z'));
    });
  });

  describe('recordPayout', () => {
    const input = { reference: 'TRX-1', note: 'bank transfer' };

    beforeEach(() => {
      payoutRepo.findVendorForPayout.mockResolvedValue({ id: 7, store_name: 'A', is_platform: false });
    });

    it('returns 404 for an unknown vendor', async () => {
      payoutRepo.findVendorForPayout.mockResolvedValue(null);

      const result = await service.recordPayout(t, 99, 7, input);

      expect(result).toEqual({ success: false, status: 404, message: 'payout.vendorNotFound' });
      expect(payoutRepo.createPayoutForVendor).not.toHaveBeenCalled();
    });

    it("refuses to pay out the store's own vendor", async () => {
      payoutRepo.findVendorForPayout.mockResolvedValue({ id: 1, store_name: 'Store', is_platform: true });

      const result = await service.recordPayout(t, 99, 1, input);

      expect(result).toEqual({ success: false, status: 400, message: 'payout.platformVendor' });
      expect(payoutRepo.createPayoutForVendor).not.toHaveBeenCalled();
    });

    it('records the payout with the admin id and the maturity cutoff', async () => {
      payoutRepo.createPayoutForVendor.mockResolvedValue({
        payout: { id: 5, amount: 13500, reference: 'TRX-1' },
        ordersCount: 2,
      });

      const result = await service.recordPayout(t, 99, 7, input);

      expect(payoutRepo.createPayoutForVendor).toHaveBeenCalledWith(7, new Date('2026-09-27T12:00:00Z'), {
        reference: 'TRX-1',
        note: 'bank transfer',
        adminId: 99,
      });
      expect(result).toEqual({
        success: true,
        status: 201,
        message: 'payout.recorded',
        data: { id: 5, vendor_id: 7, amount: 13500, reference: 'TRX-1', orders_count: 2 },
      });
    });

    it('returns 400 when nothing is available', async () => {
      payoutRepo.createPayoutForVendor.mockResolvedValue({ error: 'NOTHING_AVAILABLE' });

      const result = await service.recordPayout(t, 99, 7, input);

      expect(result).toEqual({ success: false, status: 400, message: 'payout.nothingAvailable' });
    });

    it('returns 409 on a conflict', async () => {
      payoutRepo.createPayoutForVendor.mockResolvedValue({ error: 'CONFLICT' });

      const result = await service.recordPayout(t, 99, 7, input);

      expect(result).toEqual({ success: false, status: 409, message: 'payout.conflict' });
    });

    it('returns 500 when something throws', async () => {
      payoutRepo.createPayoutForVendor.mockRejectedValue(new Error('db down'));

      const result = await service.recordPayout(t, 99, 7, input);

      expect(result).toEqual({ success: false, status: 500, message: 'payout.createError' });
    });
  });

  describe('getAllPayoutsAdmin', () => {
    it('serializes payouts with their vendor and hides who created them', async () => {
      payoutRepo.findAllPayouts.mockResolvedValue({
        payouts: [
          {
            id: 1,
            vendor: { id: 7, store_name: 'A' },
            amount: 100,
            currency: 'egp',
            reference: 'R',
            note: null,
            created_at: 'c',
            created_by_id: 99,
            _count: { vendorOrders: 2 },
          },
        ],
        totalCount: 1,
      });

      const result = await service.getAllPayoutsAdmin(t);

      expect(result.data.items[0]).toEqual({
        id: 1,
        vendor: { id: 7, store_name: 'A' },
        amount: 100,
        currency: 'egp',
        reference: 'R',
        note: null,
        created_at: 'c',
        orders_count: 2,
      });
    });
  });
});