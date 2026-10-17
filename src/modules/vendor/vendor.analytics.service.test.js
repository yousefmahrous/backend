import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeT } from '../../test/helpers.js';

vi.mock('./vendor.analytics.repository.js', () => ({
  findPaidVendorOrdersSince: vi.fn(),
  countFulfillmentByStatus: vi.fn(),
  findAllPaidVendorOrdersSince: vi.fn(),
  countVendorsByStatus: vi.fn(),
  countPendingRefundRequests: vi.fn()
}));

const repo = await import('./vendor.analytics.repository.js');
const service = await import('./vendor.analytics.service.js');

const NOW = new Date('2026-10-17T12:00:00Z');

const vendorOrder = (overrides = {}) => ({
  id: 1,
  gross_amount: 10000,
  net_amount: 9000,
  return_status: null,
  refunded_at: null,
  order: { paid_at: new Date('2026-10-17T09:00:00Z') },
  items: [{ product_id: 5, quantity: 2, unit_price: 5000, product: { title: { ar: 'منتج', en: 'Item' } } }],
  ...overrides
});

describe('parseRange', () => {
  it('accepts the allowed ranges and falls back to 30', () => {
    expect(service.parseRange('7')).toBe(7);
    expect(service.parseRange('90')).toBe(90);
    expect(service.parseRange('15')).toBe(30);
    expect(service.parseRange(undefined)).toBe(30);
  });
});

describe('buildAnalytics', () => {
  it('pre-fills every day of the window with zeros', () => {
    const result = service.buildAnalytics([], [], 7, 'en', NOW);
    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1).date).toBe('2026-10-17');
    expect(result.daily.every((d) => d.orders === 0 && d.revenue === 0)).toBe(true);
    expect(result.totals.average_order_value).toBe(0);
  });

  it('sums revenue, net, items and averages the order value', () => {
    const orders = [vendorOrder(), vendorOrder({ id: 2, gross_amount: 20000, net_amount: 18000 })];
    const { totals, daily } = service.buildAnalytics(orders, [], 7, 'en', NOW);
    expect(totals).toMatchObject({ orders: 2, revenue: 30000, net: 27000, items_sold: 4, average_order_value: 15000 });
    expect(daily.at(-1)).toEqual({ date: '2026-10-17', orders: 2, revenue: 30000 });
  });

  it('falls back to item totals when gross_amount is missing', () => {
    const { totals } = service.buildAnalytics([vendorOrder({ gross_amount: null, net_amount: null })], [], 7, 'en', NOW);
    expect(totals.revenue).toBe(10000);
    expect(totals.net).toBe(0);
  });

  it('excludes refunded shipments from revenue but counts the return', () => {
    const orders = [vendorOrder({ return_status: 'refunded', refunded_at: new Date() }), vendorOrder({ id: 2 })];
    const { totals } = service.buildAnalytics(orders, [], 7, 'en', NOW);
    expect(totals.orders).toBe(1);
    expect(totals.revenue).toBe(10000);
    expect(totals.returns).toBe(1);
  });

  it('ignores orders paid outside the window', () => {
    const old = vendorOrder({ order: { paid_at: new Date('2026-09-01T09:00:00Z') } });
    const { totals } = service.buildAnalytics([old], [], 7, 'en', NOW);
    expect(totals.orders).toBe(0);
  });

  it('ranks top products by revenue with localized titles', () => {
    const orders = [
      vendorOrder(),
      vendorOrder({
        id: 2,
        items: [{ product_id: 9, quantity: 1, unit_price: 90000, product: { title: { ar: 'غالي', en: 'Pricey' } } }]
      })
    ];
    const { top_products } = service.buildAnalytics(orders, [], 7, 'en', NOW);
    expect(top_products.map((p) => p.product_id)).toEqual([9, 5]);
    expect(top_products[0].title).toBe('Pricey');
    expect(top_products[1]).toMatchObject({ quantity: 2, revenue: 10000 });
  });

  it('returns a count for every fulfillment status, zero when absent', () => {
    const { fulfillment } = service.buildAnalytics([], [{ status: 'shipped', count: 3 }], 7, 'en', NOW);
    expect(fulfillment).toEqual({ pending: 0, processing: 0, shipped: 3, delivered: 0 });
  });
});

describe('getVendorAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by vendor and returns 200', async () => {
    repo.findPaidVendorOrdersSince.mockResolvedValue([]);
    repo.countFulfillmentByStatus.mockResolvedValue([]);
    const res = await service.getVendorAnalytics(fakeT, 'en', 7, '7');
    expect(res.status).toBe(200);
    expect(repo.findPaidVendorOrdersSince.mock.calls[0][0]).toBe(7);
    expect(repo.countFulfillmentByStatus).toHaveBeenCalledWith(7);
    expect(res.data.range_days).toBe(7);
  });

  it('returns a 500 with the translation key when the repository throws', async () => {
    repo.findPaidVendorOrdersSince.mockRejectedValue(new Error('db'));
    repo.countFulfillmentByStatus.mockResolvedValue([]);
    const res = await service.getVendorAnalytics(fakeT, 'en', 7, '30');
    expect(res).toMatchObject({ success: false, status: 500, message: 'vendor.analytics.loadError' });
  });
});

describe('buildAdminAnalytics', () => {
  const platformOrder = (overrides = {}) => ({
    id: 1,
    vendor_id: 1,
    vendor: { store_name: 'Store A' },
    gross_amount: 10000,
    commission_amount: 1000,
    refunded_at: null,
    order: { paid_at: new Date('2026-10-17T09:00:00Z') },
    items: [{ quantity: 2, unit_price: 5000 }],
    ...overrides
  });

  it('sums platform sales and commission and fills empty days', () => {
    const orders = [platformOrder(), platformOrder({ id: 2, gross_amount: 20000, commission_amount: 2000 })];
    const result = service.buildAdminAnalytics(orders, [], [], 0, 7, NOW);
    expect(result.daily).toHaveLength(7);
    expect(result.totals).toMatchObject({ orders: 2, revenue: 30000, commission: 3000, average_order_value: 15000 });
    expect(result.daily.at(-1)).toEqual({ date: '2026-10-17', orders: 2, revenue: 30000, commission: 3000 });
  });

  it('skips refunded shipments and ones outside the window', () => {
    const orders = [
      platformOrder({ refunded_at: new Date() }),
      platformOrder({ id: 2, order: { paid_at: new Date('2026-09-01T09:00:00Z') } })
    ];
    expect(service.buildAdminAnalytics(orders, [], [], 0, 7, NOW).totals.orders).toBe(0);
  });

  it('ranks top vendors by revenue', () => {
    const orders = [
      platformOrder(),
      platformOrder({ id: 2, vendor_id: 2, vendor: { store_name: 'Store B' }, gross_amount: 90000 })
    ];
    const { top_vendors } = service.buildAdminAnalytics(orders, [], [], 0, 7, NOW);
    expect(top_vendors.map((v) => v.store_name)).toEqual(['Store B', 'Store A']);
  });

  it('returns a count for every vendor and fulfillment status plus pending refunds', () => {
    const result = service.buildAdminAnalytics([], [{ status: 'shipped', count: 2 }], [{ status: 'pending', count: 4 }], 5, 7, NOW);
    expect(result.vendors).toEqual({ pending: 4, active: 0, suspended: 0, rejected: 0 });
    expect(result.fulfillment.shipped).toBe(2);
    expect(result.pending_refunds).toBe(5);
  });
});

describe('getAdminAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with the built analytics', async () => {
    repo.findAllPaidVendorOrdersSince.mockResolvedValue([]);
    repo.countFulfillmentByStatus.mockResolvedValue([]);
    repo.countVendorsByStatus.mockResolvedValue([]);
    repo.countPendingRefundRequests.mockResolvedValue(3);
    const res = await service.getAdminAnalytics(fakeT, '7');
    expect(res.status).toBe(200);
    expect(repo.countFulfillmentByStatus).toHaveBeenCalledWith();
    expect(res.data).toMatchObject({ range_days: 7, pending_refunds: 3 });
  });

  it('returns a 500 with the translation key when the repository throws', async () => {
    repo.findAllPaidVendorOrdersSince.mockRejectedValue(new Error('db'));
    repo.countFulfillmentByStatus.mockResolvedValue([]);
    repo.countVendorsByStatus.mockResolvedValue([]);
    repo.countPendingRefundRequests.mockResolvedValue(0);
    const res = await service.getAdminAnalytics(fakeT, '30');
    expect(res).toMatchObject({ status: 500, message: 'vendor.analytics.loadError' });
  });
});
