import prisma from '../../core/db.js';

const PAID_ORDER_FILTER = { paid_at: { not: null } };

export const findPaidVendorOrdersSince = async (vendorId, since) => {
  return prisma.vendorOrder.findMany({
    where: {
      vendor_id: vendorId,
      order: { paid_at: { gte: since } }
    },
    select: {
      id: true,
      gross_amount: true,
      net_amount: true,
      return_status: true,
      refunded_at: true,
      order: { select: { paid_at: true } },
      items: {
        select: {
          product_id: true,
          quantity: true,
          unit_price: true,
          product: { select: { title: true } }
        }
      }
    }
  });
};

export const countFulfillmentByStatus = async (vendorId) => {
  const rows = await prisma.vendorOrder.groupBy({
    by: ['fulfillment_status'],
    where: { ...(vendorId ? { vendor_id: vendorId } : {}), order: PAID_ORDER_FILTER },
    _count: { _all: true }
  });
  return rows.map((row) => ({ status: row.fulfillment_status, count: row._count._all }));
};

export const findAllPaidVendorOrdersSince = async (since) => {
  return prisma.vendorOrder.findMany({
    where: { order: { paid_at: { gte: since } } },
    select: {
      id: true,
      vendor_id: true,
      vendor: { select: { store_name: true } },
      gross_amount: true,
      commission_amount: true,
      refunded_at: true,
      order: { select: { paid_at: true } },
      items: { select: { quantity: true, unit_price: true } }
    }
  });
};

export const countVendorsByStatus = async () => {
  const rows = await prisma.vendor.groupBy({
    by: ['status'],
    where: { is_platform: false },
    _count: { _all: true }
  });
  return rows.map((row) => ({ status: row.status, count: row._count._all }));
};

export const countPendingRefundRequests = async () => {
  return prisma.refundRequest.count({ where: { status: 'pending' } });
};
