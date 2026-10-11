import * as payoutRepo from './payout.repository.js';
import * as settingsRepo from '../settings/settings.repository.js';
import { PAYOUT_HOLD_DAYS_SETTING, parseHoldDays } from './payout.constants.js';
import { parseDefaultBps, resolveCommissionBps } from '../commission/commission.js';
import logger from '../../core/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const getEarnings = async (t, vendor) => {
  try {
    const [holdDaysSetting, defaultBpsSetting] = await Promise.all([
      settingsRepo.getSettingValue(PAYOUT_HOLD_DAYS_SETTING),
      settingsRepo.getSettingValue('default_commission_bps')
    ]);
    const holdDays = parseHoldDays(holdDaysSetting);
    const cutoff = new Date(Date.now() - holdDays * DAY_MS);

    const totals = await payoutRepo.getEarningsTotals(vendor.id, cutoff);

    return {
      success: true,
      status: 200,
      data: {
        currency: 'egp',
        pending: totals.pending,
        available: totals.available,
        on_hold: totals.onHold,
        paid_out: totals.paidOut,
        hold_days: holdDays,
        commission_bps: resolveCommissionBps(vendor, parseDefaultBps(defaultBpsSetting))
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.earnings.loadError') };
  }
};

export const getMyPayouts = async (t, vendorId, page = 1, limit = 20) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const { payouts, totalCount } = await payoutRepo.findPayoutsByVendor(vendorId, skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: payouts.map((payout) => ({
          id: payout.id,
          amount: payout.amount,
          currency: payout.currency,
          reference: payout.reference,
          note: payout.note,
          created_at: payout.created_at,
          orders_count: payout._count.vendorOrders
        })),
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
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('vendor.payouts.loadError') };
  }
};

const loadMaturityCutoff = async () => {
  const holdDays = parseHoldDays(await settingsRepo.getSettingValue(PAYOUT_HOLD_DAYS_SETTING));
  return { holdDays, cutoff: new Date(Date.now() - holdDays * DAY_MS) };
};

export const getVendorBalances = async (t) => {
  try {
    const { holdDays, cutoff } = await loadMaturityCutoff();
    const balances = await payoutRepo.getAllVendorBalances(cutoff);

    const items = balances
      .map((row) => ({
        vendor: row.vendor,
        pending: row.pending,
        available: row.available,
        on_hold: row.onHold,
        paid_out: row.paidOut
      }))
      .sort((a, b) => b.available - a.available);

    return { success: true, status: 200, data: { items, hold_days: holdDays } };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('payout.loadError') };
  }
};

export const recordPayout = async (t, adminId, vendorId, input) => {
  try {
    const vendor = await payoutRepo.findVendorForPayout(vendorId);
    if (!vendor) {
      return { success: false, status: 404, message: t('payout.vendorNotFound') };
    }
    if (vendor.is_platform) {
      return { success: false, status: 400, message: t('payout.platformVendor') };
    }

    const { cutoff } = await loadMaturityCutoff();
    const result = await payoutRepo.createPayoutForVendor(vendorId, cutoff, {
      reference: input.reference,
      note: input.note,
      adminId
    });

    if (result.error === 'NOTHING_AVAILABLE') {
      return { success: false, status: 400, message: t('payout.nothingAvailable') };
    }
    if (result.error === 'CONFLICT') {
      return { success: false, status: 409, message: t('payout.conflict') };
    }

    return {
      success: true,
      status: 201,
      message: t('payout.recorded'),
      data: {
        id: result.payout.id,
        vendor_id: vendorId,
        amount: result.payout.amount,
        reference: result.payout.reference,
        orders_count: result.ordersCount
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('payout.createError') };
  }
};

export const getAllPayoutsAdmin = async (t, page = 1, limit = 20) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 20);
    const skip = (pageNumber - 1) * limitNumber;

    const { payouts, totalCount } = await payoutRepo.findAllPayouts(skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        items: payouts.map((payout) => ({
          id: payout.id,
          vendor: payout.vendor,
          amount: payout.amount,
          currency: payout.currency,
          reference: payout.reference,
          note: payout.note,
          created_at: payout.created_at,
          orders_count: payout._count.vendorOrders
        })),
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
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('payout.loadError') };
  }
};