import prisma from '../../core/db.js';
import { VENDOR_STATUS } from './vendor.constants.js';

let platformVendorId = null;

const OWNER_SELECT = { id: true, name: true, email: true };

export const getPlatformVendorId = async () => {
  if (platformVendorId) return platformVendorId;

  const vendor = await prisma.vendor.findFirst({
    where: { is_platform: true },
    select: { id: true }
  });

  if (!vendor) {
    throw new Error('PLATFORM_VENDOR_MISSING');
  }

  platformVendorId = vendor.id;
  return platformVendorId;
};

export const __resetPlatformVendorCache = () => {
  platformVendorId = null;
};

export const findVendorByOwnerId = async (ownerId) => {
  return prisma.vendor.findUnique({
    where: { owner_id: ownerId }
  });
};

export const findVendorById = async (id) => {
  return prisma.vendor.findUnique({
    where: { id },
    include: { owner: { select: OWNER_SELECT } }
  });
};

export const createVendorApplication = async (ownerId, storeName, slug) => {
  return prisma.vendor.create({
    data: {
      owner_id: ownerId,
      store_name: storeName,
      slug,
      status: VENDOR_STATUS.PENDING
    }
  });
};

export const resubmitVendorApplication = async (id, storeName) => {
  return prisma.vendor.update({
    where: { id },
    data: { store_name: storeName, status: VENDOR_STATUS.PENDING }
  });
};

export const findAllVendors = async (skip, take, status) => {
  const where = { is_platform: false, ...(status ? { status } : {}) };

  const [vendors, totalCount] = await Promise.all([
    prisma.vendor.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: { owner: { select: OWNER_SELECT } }
    }),
    prisma.vendor.count({ where })
  ]);

  return { vendors, totalCount };
};

export const updateVendorStatus = async (id, fromStatus, toStatus) => {
  const result = await prisma.vendor.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus }
  });
  return result.count > 0;
};