import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COMMISSION_BPS,
  parseDefaultBps,
  resolveCommissionBps,
  calculateCommission,
  buildSnapshot,
} from './commission.js';

describe('commission', () => {
  describe('parseDefaultBps', () => {
    it.each([
      [1500, 1500],
      ['1500', 1500],
      [0, 0],
      [10000, 10000],
    ])('accepts %j', (input, expected) => {
      expect(parseDefaultBps(input)).toBe(expected);
    });

    it.each([[null], [undefined], [-1], [10001], [12.5], ['abc'], [{}]])(
      'falls back to the built-in default for %j',
      (input) => {
        expect(parseDefaultBps(input)).toBe(DEFAULT_COMMISSION_BPS);
      }
    );
  });

  describe('resolveCommissionBps', () => {
    it("charges the store's own vendor nothing, whatever the rates say", () => {
      expect(resolveCommissionBps({ is_platform: true, commission_bps: 2000 }, 1000)).toBe(0);
    });

    it("uses the vendor's own rate when set", () => {
      expect(resolveCommissionBps({ is_platform: false, commission_bps: 500 }, 1000)).toBe(500);
    });

    it('treats an own rate of 0 as a real rate, not as missing', () => {
      expect(resolveCommissionBps({ is_platform: false, commission_bps: 0 }, 1000)).toBe(0);
    });

    it('falls back to the platform default when the vendor has none', () => {
      expect(resolveCommissionBps({ is_platform: false, commission_bps: null }, 1000)).toBe(1000);
    });

    it('ignores an invalid own rate', () => {
      expect(resolveCommissionBps({ is_platform: false, commission_bps: 99999 }, 1000)).toBe(1000);
    });
  });

  describe('calculateCommission', () => {
    it('splits 1000.00 EGP at 10% into 100.00 commission and 900.00 net', () => {
      expect(calculateCommission(100000, 1000)).toEqual({ commission_amount: 10000, net_amount: 90000 });
    });

    it('rounds to whole piastres and never loses or invents a piastre', () => {
      const { commission_amount, net_amount } = calculateCommission(12345, 1000);
      expect(commission_amount).toBe(1235);
      expect(commission_amount + net_amount).toBe(12345);
    });

    it('handles 0% and 100%', () => {
      expect(calculateCommission(5000, 0)).toEqual({ commission_amount: 0, net_amount: 5000 });
      expect(calculateCommission(5000, 10000)).toEqual({ commission_amount: 5000, net_amount: 0 });
    });
  });

  describe('buildSnapshot', () => {
    it("sums the vendor's items and applies the resolved rate", () => {
      const items = [
        { unit_price: 10000, quantity: 2 },
        { unit_price: 5000, quantity: 1 },
      ];

      expect(buildSnapshot(items, { is_platform: false, commission_bps: null }, 1000)).toEqual({
        commission_bps: 1000,
        gross_amount: 25000,
        commission_amount: 2500,
        net_amount: 22500,
      });
    });
  });
});