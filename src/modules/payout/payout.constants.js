export const DEFAULT_PAYOUT_HOLD_DAYS = 14;
export const MAX_PAYOUT_HOLD_DAYS = 90;
export const PAYOUT_HOLD_DAYS_SETTING = 'payout_hold_days';

export const parseHoldDays = (settingValue) => {
  const n = typeof settingValue === 'string' ? Number(settingValue) : settingValue;
  return Number.isInteger(n) && n >= 0 && n <= MAX_PAYOUT_HOLD_DAYS ? n : DEFAULT_PAYOUT_HOLD_DAYS;
};