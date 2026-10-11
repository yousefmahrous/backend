import prisma from '../../core/db.js';

export const getSettingValue = async (key) => {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return setting?.value;
};