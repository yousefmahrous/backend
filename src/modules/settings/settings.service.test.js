import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./settings.repository.js', () => ({
  getSettingValue: vi.fn(),
  setSettingValue: vi.fn(),
  findVendorsWithCommission: vi.fn(),
  findVendorForCommission: vi.fn(),
  updateVendorCommission: vi.fn(),
}));

const repo = await import('./settings.repository.js');
const service = await import('./settings.service.js');
const { updateCommissionSettingsSchema, updateVendorCommissionSchema } = await import('./settings.schema.js');

const t = fakeT;

describe('settings.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCommissionSettings', () => {
    it('returns the validated defaults and the vendors with their own rates', async () => {
      repo.getSettingValue.mockImplementation(async (key) => (key === 'default_commission_bps' ? 1500 : 30));
      repo.findVendorsWithCommission.mockResolvedValue([{ id: 7, store_name: 'A', commission_bps: null }]);

      const result = await service.getCommissionSettings(t);

      expect(result.data).toEqual({
        default_commission_bps: 1500,
        payout_hold_days: 30,
        vendors: [{ id: 7, store_name: 'A', commission_bps: null }],
      });
    });

    it('falls back to 10% and 14 days when the stored values are missing or junk', async () => {
      repo.getSettingValue.mockImplementation(async (key) => (key === 'default_commission_bps' ? 'abc' : undefined));
      repo.findVendorsWithCommission.mockResolvedValue([]);

      const result = await service.getCommissionSettings(t);

      expect(result.data.default_commission_bps).toBe(1000);
      expect(result.data.payout_hold_days).toBe(14);
    });

    it('returns a 500 when something throws', async () => {
      repo.getSettingValue.mockRejectedValue(new Error('db down'));

      expect(await service.getCommissionSettings(t)).toEqual({
        success: false,
        status: 500,
        message: 'settings.loadError',
      });
    });
  });

  describe('updateCommissionSettings', () => {
    it('writes only the settings that were sent', async () => {
      await service.updateCommissionSettings(t, { default_commission_bps: 1200 });

      expect(repo.setSettingValue).toHaveBeenCalledTimes(1);
      expect(repo.setSettingValue).toHaveBeenCalledWith('default_commission_bps', 1200);
    });

    it('writes both when both are sent, and allows 0', async () => {
      await service.updateCommissionSettings(t, { default_commission_bps: 0, payout_hold_days: 0 });

      expect(repo.setSettingValue).toHaveBeenCalledWith('default_commission_bps', 0);
      expect(repo.setSettingValue).toHaveBeenCalledWith('payout_hold_days', 0);
    });

    it('returns a 500 when the write fails', async () => {
      repo.setSettingValue.mockRejectedValue(new Error('db down'));

      const result = await service.updateCommissionSettings(t, { payout_hold_days: 10 });

      expect(result).toEqual({ success: false, status: 500, message: 'settings.updateError' });
    });
  });

  describe('updateVendorCommission', () => {
    it('returns 404 for an unknown vendor', async () => {
      repo.findVendorForCommission.mockResolvedValue(null);

      expect((await service.updateVendorCommission(t, 9, 500)).status).toBe(404);
      expect(repo.updateVendorCommission).not.toHaveBeenCalled();
    });

    it("refuses to set a commission on the store's own vendor", async () => {
      repo.findVendorForCommission.mockResolvedValue({ id: 1, is_platform: true });

      expect((await service.updateVendorCommission(t, 1, 500)).status).toBe(400);
      expect(repo.updateVendorCommission).not.toHaveBeenCalled();
    });

    it('sets a vendor rate, and null clears it back to the platform default', async () => {
      repo.findVendorForCommission.mockResolvedValue({ id: 7, is_platform: false });
      repo.updateVendorCommission.mockResolvedValue({ id: 7, store_name: 'A', commission_bps: 500 });

      const result = await service.updateVendorCommission(t, 7, 500);
      expect(result).toMatchObject({ success: true, status: 200, data: { commission_bps: 500 } });

      await service.updateVendorCommission(t, 7, null);
      expect(repo.updateVendorCommission).toHaveBeenLastCalledWith(7, null);
    });
  });

  describe('schemas', () => {
    it('accepts valid settings and rejects out-of-range or empty bodies', () => {
      const schema = updateCommissionSettingsSchema(t);
      expect(schema.safeParse({ default_commission_bps: 1000, payout_hold_days: 14 }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ default_commission_bps: 10001 }).success).toBe(false);
      expect(schema.safeParse({ default_commission_bps: -1 }).success).toBe(false);
      expect(schema.safeParse({ default_commission_bps: 12.5 }).success).toBe(false);
      expect(schema.safeParse({ default_commission_bps: '1000' }).success).toBe(false);
      expect(schema.safeParse({ payout_hold_days: 91 }).success).toBe(false);
    });

    it('accepts a number or null for a vendor rate, but not a missing or invalid one', () => {
      const schema = updateVendorCommissionSchema(t);
      expect(schema.safeParse({ commission_bps: 0 }).success).toBe(true);
      expect(schema.safeParse({ commission_bps: null }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ commission_bps: 10001 }).success).toBe(false);
    });
  });
});