import prisma from '../../core/db.js';

const OPEN_RETURN_STATUSES = ['requested', 'approved'];

const sumNet = async (where) => {
  const result = await prisma.vendorOrder.aggregate({ _sum: { net_amount: true }, where });
  return result._sum.net_amount ?? 0;
};

const buildBucketWheres = (maturityCutoff, scope = {}) => {
  const unpaid = { ...scope, gross_amount: { not: null }, payout_id: null };
  const paidOrder = { paid_at: { not: null } };
  const matured = { fulfillment_status: 'delivered', order: { paid_at: { lte: maturityCutoff } } };

  return {
    pending: { ...unpaid, return_status: null, order: { ...paidOrder, status: 'paid' }, NOT: matured },
    available: {
      ...unpaid,
      return_status: null,
      fulfillment_status: 'delivered',
      order: { status: 'paid', paid_at: { lte: maturityCutoff } }
    },
    onHold: { ...unpaid, return_status: { in: OPEN_RETURN_STATUSES }, order: paidOrder }
  };
};

export const getEarningsTotals = async (vendorId, maturityCutoff) => {
  const wheres = buildBucketWheres(maturityCutoff, { vendor_id: vendorId });

  const [pending, available, onHold, paidOutResult] = await Promise.all([
    sumNet(wheres.pending),
    sumNet(wheres.available),
    sumNet(wheres.onHold),
    prisma.payout.aggregate({ _sum: { amount: true }, where: { vendor_id: vendorId } })
  ]);

  return { pending, available, onHold, paidOut: paidOutResult._sum.amount ?? 0 };
};

const groupNetByVendor = async (where) => {
  const rows = await prisma.vendorOrder.groupBy({ by: ['vendor_id'], _sum: { net_amount: true }, where });
  return new Map(rows.map((row) => [row.vendor_id, row._sum.net_amount ?? 0]));
};

export const getAllVendorBalances = async (maturityCutoff) => {
  const wheres = buildBucketWheres(maturityCutoff);

  const [vendors, pending, available, onHold, paidRows] = await Promise.all([
    prisma.vendor.findMany({
      where: { is_platform: false },
      select: { id: true, store_name: true, status: true },
      orderBy: { store_name: 'asc' }
    }),
    groupNetByVendor(wheres.pending),
    groupNetByVendor(wheres.available),
    groupNetByVendor(wheres.onHold),
    prisma.payout.groupBy({ by: ['vendor_id'], _sum: { amount: true } })
  ]);
  const paidOut = new Map(paidRows.map((row) => [row.vendor_id, row._sum.amount ?? 0]));

  return vendors.map((vendor) => ({
    vendor,
    pending: pending.get(vendor.id) ?? 0,
    available: available.get(vendor.id) ?? 0,
    onHold: onHold.get(vendor.id) ?? 0,
    paidOut: paidOut.get(vendor.id) ?? 0
  }));
};

export const findVendorForPayout = async (vendorId) => {
  return prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, store_name: true, is_platform: true }
  });
};

export const createPayoutForVendor = async (vendorId, maturityCutoff, { reference, note, adminId }) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const { available } = buildBucketWheres(maturityCutoff, { vendor_id: vendorId });

      const rows = await tx.vendorOrder.findMany({ where: available, select: { id: true, net_amount: true } });
      const amount = rows.reduce((sum, row) => sum + (row.net_amount ?? 0), 0);
      if (rows.length === 0 || amount <= 0) return { error: 'NOTHING_AVAILABLE' };

      const payout = await tx.payout.create({
        data: { vendor_id: vendorId, amount, reference, note: note ?? null, created_by_id: adminId }
      });

      const stamped = await tx.vendorOrder.updateMany({
        where: { ...available, id: { in: rows.map((row) => row.id) } },
        data: { payout_id: payout.id }
      });
      if (stamped.count !== rows.length) throw new Error('PAYOUT_CONFLICT');

      return { payout, ordersCount: rows.length };
    });
  } catch (err) {
    if (err.message === 'PAYOUT_CONFLICT') return { error: 'CONFLICT' };
    throw err;
  }
};

export const findAllPayouts = async (skip, take) => {
  const [payouts, totalCount] = await Promise.all([
    prisma.payout.findMany({
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: {
        vendor: { select: { id: true, store_name: true } },
        _count: { select: { vendorOrders: true } }
      }
    }),
    prisma.payout.count()
  ]);

  return { payouts, totalCount };
};

export const findPayoutsByVendor = async (vendorId, skip, take) => {
  const where = { vendor_id: vendorId };

  const [payouts, totalCount] = await Promise.all([
    prisma.payout.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: { _count: { select: { vendorOrders: true } } }
    }),
    prisma.payout.count({ where })
  ]);

  return { payouts, totalCount };
};