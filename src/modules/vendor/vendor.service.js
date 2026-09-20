import * as vendorRepo from './vendor.repository.js';
import { VENDOR_STATUS, VENDOR_STATUSES, VENDOR_TRANSITIONS } from './vendor.constants.js';
import logger from '../../core/logger.js';

export const buildVendorSlug = (storeName, ownerId) => {
  const base = storeName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');

  return base ? `${base}-${ownerId}` : `store-${ownerId}`;
};

const serializeVendor = (vendor) => ({
  id: vendor.id,
  store_name: vendor.store_name,
  slug: vendor.slug,
  status: vendor.status,
  commission_bps: vendor.commission_bps,
  created_at: vendor.created_at,
  ...(vendor.owner
    ? { owner: { id: vendor.owner.id, name: vendor.owner.name, email: vendor.owner.email } }
    : {})
});

export const applyAsVendor = async (t, userId, storeName) => {
  try {
    const existing = await vendorRepo.findVendorByOwnerId(userId);

    if (existing && existing.status !== VENDOR_STATUS.REJECTED) {
      return { success: false, status: 409, message: t('vendor.alreadyExists') };
    }

    const vendor = existing
      ? await vendorRepo.resubmitVendorApplication(existing.id, storeName)
      : await vendorRepo.createVendorApplication(userId, storeName, buildVendorSlug(storeName, userId));

    return {
      success: true,
      status: 201,
      message: t('vendor.applied'),
      data: serializeVendor(vendor)
    };
  } catch (err) {
    if (err.code === 'P2002') {
      return { success: false, status: 409, message: t('vendor.alreadyExists') };
    }
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.applyError') };
  }
};

export const getMyVendor = async (t, userId) => {
  try {
    const vendor = await vendorRepo.findVendorByOwnerId(userId);
    return { success: true, status: 200, data: vendor ? serializeVendor(vendor) : null };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.loadError') };
  }
};

export const getAllVendorsAdmin = async (t, page = 1, limit = 20, status) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;
    const safeStatus = VENDOR_STATUSES.includes(status) ? status : undefined;

    const { vendors, totalCount } = await vendorRepo.findAllVendors(skip, limitNumber, safeStatus);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: vendors.map(serializeVendor),
        pagination: {
          totalCount,
          totalPages,
          currentPage: pageNumber,
          limit: limitNumber,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1
        }
      }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.loadError') };
  }
};

export const changeVendorStatus = async (t, id, newStatus) => {
  try {
    const vendor = await vendorRepo.findVendorById(id);

    if (!vendor) {
      return { success: false, status: 404, message: t('vendor.notFound') };
    }

    if (vendor.is_platform) {
      return { success: false, status: 400, message: t('vendor.platformImmutable') };
    }

    const allowed = VENDOR_TRANSITIONS[vendor.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return { success: false, status: 400, message: t('vendor.invalidTransition') };
    }

    const updated = await vendorRepo.updateVendorStatus(id, vendor.status, newStatus);
    if (!updated) {
      return { success: false, status: 409, message: t('vendor.statusConflict') };
    }

    return {
      success: true,
      status: 200,
      message: t('vendor.statusUpdated'),
      data: serializeVendor({ ...vendor, status: newStatus })
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.updateError') };
  }
};