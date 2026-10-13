import * as settingsRepo from './settings.repository.js';
import { parseDefaultBps } from '../commission/commission.js';
import { parseHoldDays, PAYOUT_HOLD_DAYS_SETTING } from '../payout/payout.constants.js';
import logger from '../../core/logger.js';

const DEFAULT_COMMISSION_SETTING = 'default_commission_bps';

export const getCommissionSettings = async (t) => {
  try {
    const [defaultBps, holdDays, vendors] = await Promise.all([
      settingsRepo.getSettingValue(DEFAULT_COMMISSION_SETTING),
      settingsRepo.getSettingValue(PAYOUT_HOLD_DAYS_SETTING),
      settingsRepo.findVendorsWithCommission()
    ]);

    return {
      success: true,
      status: 200,
      data: {
        default_commission_bps: parseDefaultBps(defaultBps),
        payout_hold_days: parseHoldDays(holdDays),
        vendors
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('settings.loadError') };
  }
};

export const updateCommissionSettings = async (t, input) => {
  try {
    if (input.default_commission_bps !== undefined) {
      await settingsRepo.setSettingValue(DEFAULT_COMMISSION_SETTING, input.default_commission_bps);
    }
    if (input.payout_hold_days !== undefined) {
      await settingsRepo.setSettingValue(PAYOUT_HOLD_DAYS_SETTING, input.payout_hold_days);
    }

    return { success: true, status: 200, message: t('settings.updated') };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('settings.updateError') };
  }
};

export const updateVendorCommission = async (t, vendorId, commissionBps) => {
  try {
    const vendor = await settingsRepo.findVendorForCommission(vendorId);
    if (!vendor) {
      return { success: false, status: 404, message: t('settings.vendorNotFound') };
    }
    if (vendor.is_platform) {
      return { success: false, status: 400, message: t('settings.platformVendor') };
    }

    const updated = await settingsRepo.updateVendorCommission(vendorId, commissionBps);

    return { success: true, status: 200, message: t('settings.updated'), data: updated };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('settings.updateError') };
  }
};