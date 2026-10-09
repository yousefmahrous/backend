export const DEFAULT_COMMISSION_BPS = 1000;
export const MAX_COMMISSION_BPS = 10000;

export const isValidBps = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_COMMISSION_BPS;

export const parseDefaultBps = (settingValue) => {
  const n = typeof settingValue === 'string' ? Number(settingValue) : settingValue;
  return isValidBps(n) ? n : DEFAULT_COMMISSION_BPS;
};

export const resolveCommissionBps = (vendor, defaultBps) => {
  if (vendor.is_platform) return 0;
  return isValidBps(vendor.commission_bps) ? vendor.commission_bps : defaultBps;
};

export const calculateCommission = (grossAmount, bps) => {
  const commission = Math.round((grossAmount * bps) / 10000);
  return { commission_amount: commission, net_amount: grossAmount - commission };
};

export const buildSnapshot = (items, vendor, defaultBps) => {
  const gross = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const bps = resolveCommissionBps(vendor, defaultBps);
  return { commission_bps: bps, gross_amount: gross, ...calculateCommission(gross, bps) };
};