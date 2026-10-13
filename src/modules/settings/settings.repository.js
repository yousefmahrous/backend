import prisma from '../../core/db.js';

export const getSettingValue = async (key) => {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return setting?.value;
};

export const setSettingValue = async (key, value) => {
  return prisma.platformSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
};

export const findVendorsWithCommission = async () => {
  return prisma.vendor.findMany({
    where: { is_platform: false },
    select: { id: true, store_name: true, status: true, commission_bps: true },
    orderBy: { store_name: 'asc' }
  });
};

export const findVendorForCommission = async (vendorId) => {
  return prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, is_platform: true }
  });
};

export const updateVendorCommission = async (vendorId, commissionBps) => {
  return prisma.vendor.update({
    where: { id: vendorId },
    data: { commission_bps: commissionBps },
    select: { id: true, store_name: true, commission_bps: true }
  });
};