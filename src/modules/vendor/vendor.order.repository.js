import prisma from '../../core/db.js';

const VISIBLE_ORDER_FILTER = { paid_at: { not: null } };

const VENDOR_ORDER_INCLUDE = {
  order: {
    select: {
      id: true,
      status: true,
      paid_at: true,
      created_at: true,
      shipping_name: true,
      shipping_phone: true,
      shipping_address: true,
      shipping_city: true,
      shipping_notes: true
    }
  },
  items: { include: { book: true } }
};

export const findVendorOrders = async (vendorId, skip, take, fulfillmentStatus) => {
  const where = {
    vendor_id: vendorId,
    order: VISIBLE_ORDER_FILTER,
    ...(fulfillmentStatus ? { fulfillment_status: fulfillmentStatus } : {})
  };

  const [vendorOrders, totalCount] = await Promise.all([
    prisma.vendorOrder.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: VENDOR_ORDER_INCLUDE
    }),
    prisma.vendorOrder.count({ where })
  ]);

  return { vendorOrders, totalCount };
};

export const findVendorOrderById = async (id, vendorId) => {
  return prisma.vendorOrder.findFirst({
    where: { id, vendor_id: vendorId, order: VISIBLE_ORDER_FILTER },
    include: VENDOR_ORDER_INCLUDE
  });
};

export const transitionFulfillment = async (id, vendorId, fromStatus, data) => {
  const result = await prisma.vendorOrder.updateMany({
    where: {
      id,
      vendor_id: vendorId,
      fulfillment_status: fromStatus,
      order: { status: 'paid' }
    },
    data
  });
  return result.count > 0;
};