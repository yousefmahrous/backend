import * as productRepo from '../product/product.repository.js';
import * as categoryRepo from '../category/category.repository.js';
import { serializeProduct } from '../product/product.service.js';
import { getIO } from '../../core/config/socket.config.js';
import redisClient from '../../core/config/redis.client.js';
import logger from '../../core/logger.js';

const invalidateProductsCache = async (id) => {
  try {
    await redisClient.del(['products:all', `products:${id}`]);
  } catch (err) {
    logger.warn({ err }, 'تخطي خطأ مسح الكاش من Redis');
  }
};

export const getMyProducts = async (t, vendorId, page = 1, limit = 10) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const { products, totalCount } = await productRepo.getProductsByVendor(vendorId, skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        users: products.map(serializeProduct),
        pagination: { totalCount, totalPages, currentPage: pageNumber, limit: limitNumber }
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const getMyProductById = async (t, vendorId, id) => {
  try {
    const product = await productRepo.getVendorProductById(vendorId, id);
    if (!product) {
      return { success: false, status: 404, message: t('product.notFound') };
    }
    return { success: true, status: 200, data: { user: serializeProduct(product) } };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const addMyProduct = async (t, vendorId, productData) => {
  try {
    const category = await categoryRepo.findCategoryBySlug(productData.category);
    if (!category) {
      return { success: false, status: 400, message: t('product.validation.categoryInvalid'), errors: { category: [t('product.validation.categoryInvalid')] } };
    }

    await productRepo.createProduct({ ...productData, category_id: category.id }, vendorId);
    await invalidateProductsCache('all');
    getIO().emit('products_updated');

    return { success: true, status: 201, message: t('product.added') };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('product.addError') };
  }
};

export const editMyProduct = async (t, vendorId, id, productData) => {
  try {
    const updated = await productRepo.updateVendorProduct(vendorId, id, productData);
    if (!updated) {
      return { success: false, status: 404, message: t('product.notFound') };
    }

    await invalidateProductsCache(id);
    getIO().emit('products_updated');

    return { success: true, status: 200, message: t('product.updated') };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('product.updateError') };
  }
};

export const deleteMyProduct = async (t, vendorId, id) => {
  try {
    const deleted = await productRepo.deleteVendorProduct(vendorId, id);
    if (!deleted) {
      return { success: false, status: 404, message: t('product.notFound') };
    }

    await invalidateProductsCache(id);
    getIO().emit('products_updated');

    return { success: true, status: 200, message: t('product.deleted') };
  } catch (err) {
    const isFk = err.code === 'P2003' || /foreign key|RESTRICT/i.test(err.message || '');
    if (isFk) {
      return { success: false, status: 409, message: t('product.deleteForeignKey') };
    }
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('product.deleteError') };
  }
};