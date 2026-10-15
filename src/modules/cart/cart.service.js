import * as cartRepo from './cart.repository.js';
import * as paymentService from '../payment/payment.service.js';
import { getIO } from '../../core/config/socket.config.js';
import redisClient from '../../core/config/redis.client.js';
import logger from '../../core/logger.js';

const serializeCartItem = (item) => ({
  id: item.id,
  quantity: item.quantity,
  variant: {
    id: item.variant.id,
    sku: item.variant.sku,
    options: item.variant.options
  },
  product: {
    id: item.variant.product.id,
    name: item.variant.product.title,
    number: item.variant.product.isbn,
    category: item.variant.product.category,
    avatar_url: item.variant.product.cover_url,
    stock: item.variant.stock,
    price: item.variant.price
  }
});

const serializeCart = (cart) => ({
  id: cart.id,
  items: cart.items.map(serializeCartItem),
  itemsCount: cart.items.reduce((sum, i) => sum + i.quantity, 0)
});

const emitProductsUpdated = () => {
  try {
    getIO().emit('products_updated');
  } catch (err) {
    logger.warn({ err }, 'تخطي خطأ إرسال حدث تحديث الكتب عبر السوكيت');
  }
};

const invalidateProductCache = async (productId) => {
  try {
    await redisClient.del(['products:all', `products:${productId}`]);
  } catch (redisErr) {
    logger.warn({ err: redisErr }, 'تخطي خطأ مسح الكاش من Redis أثناء تحديث الكمية');
  }
};

export const getCart = async (t, userId) => {
  try {
    await paymentService.expireStalePendingOrders(userId);
    const cart = await cartRepo.getOrCreateCart(userId);
    return { success: true, status: 200, data: serializeCart(cart) };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('cart.loadError') };
  }
};

export const addToCart = async (t, userId, productId, variantId) => {
  try {
    let variant;
    if (variantId) {
      variant = await cartRepo.getVariantById(variantId);
      if (variant && productId && variant.product_id !== productId) variant = null;
    } else {
      const variants = await cartRepo.getVariantsByProductId(productId);
      if (variants.length > 1) {
        return { success: false, status: 400, message: t('cart.variantRequired') };
      }
      variant = variants[0];
    }
    if (!variant) {
      return { success: false, status: 404, message: t('cart.productNotFound') };
    }

    // A vendor can't buy their own products (fake sales / commission abuse).
    if (variant.product?.vendor?.owner_id === userId) {
      return { success: false, status: 403, message: t('cart.ownProduct') };
    }

    const cart = await cartRepo.getOrCreateCart(userId);

    try {
      await cartRepo.reserveAndAddItem(cart.id, variant.id, 1);
    } catch (txErr) {
      if (txErr.message === 'OUT_OF_STOCK') {
        return { success: false, status: 400, message: t('cart.outOfStock') };
      }
      throw txErr;
    }

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateProductCache(variant.product_id);
    emitProductsUpdated();

    return { success: true, status: 201, data: serializeCart(updatedCart), message: t('cart.addSuccess') };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('cart.addError') };
  }
};

export const updateQuantity = async (t, userId, itemId, quantity) => {
  try {
    if (quantity < 1) {
      return { success: false, status: 400, message: t('cart.quantityMin') };
    }

    const cart = await cartRepo.getOrCreateCart(userId);
    const item = await cartRepo.findCartItem(cart.id, itemId);
    if (!item) {
      return { success: false, status: 404, message: t('cart.itemNotFound') };
    }

    try {
      await cartRepo.reserveAndUpdateQuantity(itemId, quantity);
    } catch (txErr) {
      if (txErr.message === 'OUT_OF_STOCK') {
        return { success: false, status: 400, message: t('cart.maxStock', { stock: item.variant.stock }) };
      }
      if (txErr.message === 'ITEM_NOT_FOUND') {
        return { success: false, status: 404, message: t('cart.itemNotFound') };
      }
      throw txErr;
    }

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateProductCache(item.variant.product.id);
    emitProductsUpdated();

    return { success: true, status: 200, data: serializeCart(updatedCart) };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('cart.updateError') };
  }
};

export const removeFromCart = async (t, userId, itemId) => {
  try {
    const cart = await cartRepo.getOrCreateCart(userId);
    const item = await cartRepo.findCartItem(cart.id, itemId);
    if (!item) {
      return { success: false, status: 404, message: t('cart.itemNotFound') };
    }
    await cartRepo.releaseAndRemoveItem(itemId);

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateProductCache(item.variant.product.id);
    emitProductsUpdated();

    return { success: true, status: 200, data: serializeCart(updatedCart), message: t('cart.removeSuccess') };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('cart.removeError') };
  }
};