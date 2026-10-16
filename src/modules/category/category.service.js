import * as categoryRepo from './category.repository.js';
import logger from '../../core/logger.js';

export const getAllCategories = async (t) => {
  try {
    const categories = await categoryRepo.findAllCategories();
    return { success: true, status: 200, data: categories };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('category.loadError') };
  }
};

export const addCategory = async (t, data) => {
  try {
    const category = await categoryRepo.createCategory(data);
    return { success: true, status: 201, message: t('category.added'), data: category };
  } catch (err) {
    if (err.code === 'P2002') {
      return { success: false, status: 409, message: t('category.slugTaken') };
    }
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('category.addError') };
  }
};

export const editCategory = async (t, id, data) => {
  try {
    if (data.parent_id === id) {
      return { success: false, status: 400, message: t('category.invalidParent') };
    }
    const updated = await categoryRepo.updateCategory(id, data);
    if (!updated) {
      return { success: false, status: 404, message: t('category.notFound') };
    }
    return { success: true, status: 200, message: t('category.updated') };
  } catch (err) {
    if (err.code === 'P2002') {
      return { success: false, status: 409, message: t('category.slugTaken') };
    }
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('category.updateError') };
  }
};

export const removeCategory = async (t, id) => {
  try {
    await categoryRepo.deleteCategory(id);
    return { success: true, status: 200, message: t('category.deleted') };
  } catch (err) {
    if (err.code === 'P2025') {
      return { success: false, status: 404, message: t('category.notFound') };
    }

    const isForeignKeyError =
      err.code === 'P2003' ||
      err.code === 'P2039' ||
      /foreign key|RESTRICT/i.test(err.message || '');
    if (isForeignKeyError) {
      return { success: false, status: 409, message: t('category.inUse') };
    }
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('category.deleteError') };
  }
};