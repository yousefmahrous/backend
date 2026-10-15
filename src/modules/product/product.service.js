import * as productRepo from './product.repository.js';
import * as categoryRepo from '../category/category.repository.js';
import redisClient from '../../core/config/redis.client.js';
import { getIO } from '../../core/config/socket.config.js';
import logger from '../../core/logger.js';


export const serializeProduct = (product) => {
  if (!product) return product;
  const variant = product.variants?.[0];
  return {
    id: product.id,
    name: product.title,
    number: product.isbn,
    email: product.publisher_email,
    adress: product.description,
    centre: product.publisher,
    category: product.category,
    price: variant ? variant.price : product.price,
    stock: variant ? variant.stock : product.stock,
    variants: (product.variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      options: v.options,
      price: v.price,
      stock: v.stock,
    })),
    avatar_url: product.cover_url,
    avatar_url: product.cover_url,
    avatar_key: product.cover_key,
  };
};

export const getAllProducts = async (t, page = 1, limit = 10, search = "", category = "") => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;
    const { products, totalCount } = await productRepo.getAllProducts(skip, limitNumber, search, category);
    const totalPages = Math.ceil(totalCount / limitNumber);

    return {
      success: true,
      status: 200,
      data: {
        users: products.map(serializeProduct),
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
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const getProductById = async (t, id, isAdmin = false) => {
  try {
    if (isAdmin) {
      const product = await productRepo.getProductById(id);
      if (!product) {
        return { success: false, status: 404, message: t('product.notFound') };
      }
      return { success: true, status: 200, data: { user: serializeProduct(product) } };
    }

    const cachedProduct = await redisClient.get(`products:${id}`);
    if (cachedProduct) {
      return { success: true, status: 200, data: { user: JSON.parse(cachedProduct) } };
    }

    const product = await productRepo.getProductById(id);
    const isHidden = !product || product.status !== 'published' || product.vendor?.status !== 'active';
    if (isHidden) {
      return { success: false, status: 404, message: t('product.notFound') };
    }

    const serialized = serializeProduct(product);
    await redisClient.set(`products:${id}`, JSON.stringify(serialized), { EX: 3600 });

    return { success: true, status: 200, data: { user: serialized } };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const addProduct = async (t, productData) => {
  try {
    const category = await categoryRepo.findCategoryBySlug(productData.category);
    if (!category) {
      return {
        success: false,
        status: 400,
        errors: { category: [t('product.validation.categoryInvalid')] }
      };
    }

    await productRepo.createProduct({ ...productData, category_id: category.id });

    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del('products:all');
      }
    } catch (redisErr) {
      logger.warn({ err: redisErr }, 'تخطي خطأ مسح الكاش من Redis أثناء الإضافة');
    }

    getIO().emit('products_updated');

    return { success: true, status: 201, message: t('product.added') };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('product.addError') };
  }
};

export const deleteProduct = async (t, id) => {
  try {
    await productRepo.deleteProduct(id);
    await redisClient.del(['products:all', `products:${id}`]);
    getIO().emit('products_updated');
    return { success: true, status: 200, message: t('product.deleted') };
  } catch (err) {
    const isForeignKeyError =
      err.code === 'P2003' ||
      err.code === 'P2039' ||
      /foreign key|RESTRICT/i.test(err.message || '');

    if (isForeignKeyError) {
      return {
        success: false,
        status: 409,
        message: t('product.deleteForeignKey')
      };
    }
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('product.deleteError') };
  }
};

export const editProduct = async (t, id, productData) => {
  try {
    await productRepo.updateProduct(id, productData);

    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del(['products:all', `products:${id}`]);
      }
    } catch (redisErr) {
      logger.warn({ err: redisErr }, 'تخطي خطأ مسح الكاش من Redis');
    }
    getIO().emit('products_updated');
    return { success: true, status: 200, message: t('product.updated') };

  } catch (err) {
    logger.error({ err: err }, 'خطأ الباك إند في التعديل');

    if (err.code === 'P2025') {
      return { success: false, status: 404, message: t('product.notFound') };
    }

    return { success: false, status: 500, message: t('product.updateError') };
  }
};

export const getPopularProducts = async (t, limit = 10) => {
  try {
    const limitNumber = Math.max(1, Math.min(50, parseInt(limit) || 10));
    const products = await productRepo.getPopularProducts(limitNumber);

    return {
      success: true,
      status: 200,
      data: { users: products.map(serializeProduct) }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};