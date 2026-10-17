import * as analyticsRepo from './vendor.analytics.repository.js';
import { FULFILLMENT_STATUSES, VENDOR_STATUSES } from './vendor.constants.js';
import { pickLocalized } from '../../core/i18n/localized.js';
import logger from '../../core/logger.js';

export const ALLOWED_RANGES = [7, 30, 90];
const DEFAULT_RANGE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_PRODUCTS_LIMIT = 5;
const STORE_TIME_ZONE = 'Africa/Cairo';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const toDayKey = (date) => dayFormatter.format(date);

export const parseRange = (value) => {
  const days = parseInt(value);
  return ALLOWED_RANGES.includes(days) ? days : DEFAULT_RANGE;
};

const itemsTotal = (items) => items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

const prefillDays = (days, now, makeBucket) => {
  const daily = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    daily.set(toDayKey(new Date(now.getTime() - i * DAY_MS)), makeBucket());
  }
  return daily;
};

const countsByStatus = (statuses, rows) => {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  for (const row of rows) {
    if (row.status in counts) counts[row.status] = row.count;
  }
  return counts;
};

export const buildAnalytics = (vendorOrders, fulfillmentRows, days, lang, now = new Date()) => {
  const daily = prefillDays(days, now, () => ({ orders: 0, revenue: 0 }));

  const products = new Map();
  const totals = { orders: 0, items_sold: 0, revenue: 0, net: 0, returns: 0 };

  for (const vendorOrder of vendorOrders) {
    const bucket = daily.get(toDayKey(vendorOrder.order.paid_at));
    if (!bucket) continue;

    if (vendorOrder.return_status) totals.returns += 1;
    if (vendorOrder.refunded_at) continue;

    const revenue = vendorOrder.gross_amount ?? itemsTotal(vendorOrder.items);
    totals.orders += 1;
    totals.revenue += revenue;
    totals.net += vendorOrder.net_amount ?? 0;

    bucket.orders += 1;
    bucket.revenue += revenue;

    for (const item of vendorOrder.items) {
      totals.items_sold += item.quantity;
      const entry = products.get(item.product_id) ?? {
        product_id: item.product_id,
        title: pickLocalized(item.product?.title, lang),
        quantity: 0,
        revenue: 0
      };
      entry.quantity += item.quantity;
      entry.revenue += item.unit_price * item.quantity;
      products.set(item.product_id, entry);
    }
  }

  const fulfillment = countsByStatus(FULFILLMENT_STATUSES, fulfillmentRows);

  return {
    range_days: days,
    totals: {
      ...totals,
      average_order_value: totals.orders ? Math.round(totals.revenue / totals.orders) : 0
    },
    daily: [...daily.entries()].map(([date, value]) => ({ date, ...value })),
    top_products: [...products.values()]
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      .slice(0, TOP_PRODUCTS_LIMIT),
    fulfillment
  };
};

export const getVendorAnalytics = async (t, lang, vendorId, range) => {
  try {
    const days = parseRange(range);
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);

    const [vendorOrders, fulfillmentRows] = await Promise.all([
      analyticsRepo.findPaidVendorOrdersSince(vendorId, since),
      analyticsRepo.countFulfillmentByStatus(vendorId)
    ]);

    return {
      success: true,
      status: 200,
      data: buildAnalytics(vendorOrders, fulfillmentRows, days, lang, now)
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.analytics.loadError') };
  }
};

export const buildAdminAnalytics = (
  vendorOrders,
  fulfillmentRows,
  vendorStatusRows,
  pendingRefunds,
  days,
  now = new Date()
) => {
  const daily = prefillDays(days, now, () => ({ orders: 0, revenue: 0, commission: 0 }));
  const vendors = new Map();
  const totals = { orders: 0, revenue: 0, commission: 0 };

  for (const vendorOrder of vendorOrders) {
    const bucket = daily.get(toDayKey(vendorOrder.order.paid_at));
    if (!bucket || vendorOrder.refunded_at) continue;

    const revenue = vendorOrder.gross_amount ?? itemsTotal(vendorOrder.items);
    const commission = vendorOrder.commission_amount ?? 0;

    totals.orders += 1;
    totals.revenue += revenue;
    totals.commission += commission;
    bucket.orders += 1;
    bucket.revenue += revenue;
    bucket.commission += commission;

    const entry = vendors.get(vendorOrder.vendor_id) ?? {
      vendor_id: vendorOrder.vendor_id,
      store_name: vendorOrder.vendor?.store_name ?? '',
      orders: 0,
      revenue: 0,
      commission: 0
    };
    entry.orders += 1;
    entry.revenue += revenue;
    entry.commission += commission;
    vendors.set(vendorOrder.vendor_id, entry);
  }

  return {
    range_days: days,
    totals: {
      ...totals,
      average_order_value: totals.orders ? Math.round(totals.revenue / totals.orders) : 0
    },
    daily: [...daily.entries()].map(([date, value]) => ({ date, ...value })),
    top_vendors: [...vendors.values()]
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
      .slice(0, TOP_PRODUCTS_LIMIT),
    vendors: countsByStatus(VENDOR_STATUSES, vendorStatusRows),
    fulfillment: countsByStatus(FULFILLMENT_STATUSES, fulfillmentRows),
    pending_refunds: pendingRefunds
  };
};

export const getAdminAnalytics = async (t, range) => {
  try {
    const days = parseRange(range);
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);

    const [vendorOrders, fulfillmentRows, vendorStatusRows, pendingRefunds] = await Promise.all([
      analyticsRepo.findAllPaidVendorOrdersSince(since),
      analyticsRepo.countFulfillmentByStatus(),
      analyticsRepo.countVendorsByStatus(),
      analyticsRepo.countPendingRefundRequests()
    ]);

    return {
      success: true,
      status: 200,
      data: buildAdminAnalytics(vendorOrders, fulfillmentRows, vendorStatusRows, pendingRefunds, days, now)
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.analytics.loadError') };
  }
};
