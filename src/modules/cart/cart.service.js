import * as cartRepo from './cart.repository.js';
import * as paymentService from '../payment/payment.service.js';
import { getIO } from '../../core/config/socket.config.js';
import redisClient from '../../core/config/redis.client.js';
import logger from '../../core/logger.js';

const serializeCartItem = (item) => ({
  id: item.id,
  quantity: item.quantity,
  book: {
    id: item.book.id,
    name: item.book.title,
    number: item.book.isbn,
    category: item.book.category,
    avatar_url: item.book.cover_url,
    stock: item.book.stock,
    price: item.book.price
  }
});

const serializeCart = (cart) => ({
  id: cart.id,
  items: cart.items.map(serializeCartItem),
  itemsCount: cart.items.reduce((sum, i) => sum + i.quantity, 0)
});

const emitBooksUpdated = () => {
  try {
    getIO().emit('books_updated');
  } catch (err) {
    logger.warn({ err }, 'تخطي خطأ إرسال حدث تحديث الكتب عبر السوكيت');
  }
};

const invalidateBookCache = async (bookId) => {
  try {
    await redisClient.del(['books:all', `books:${bookId}`]);
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

export const addToCart = async (t, userId, bookId) => {
  try {
    const book = await cartRepo.getBookById(bookId);
    if (!book) {
      return { success: false, status: 404, message: t('cart.bookNotFound') };
    }

    const cart = await cartRepo.getOrCreateCart(userId);

    try {

      await cartRepo.reserveAndAddItem(cart.id, bookId, 1);
    } catch (txErr) {
      if (txErr.message === 'OUT_OF_STOCK') {
        return { success: false, status: 400, message: t('cart.outOfStock') };
      }
      throw txErr;
    }

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateBookCache(bookId);
    emitBooksUpdated();

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
        return { success: false, status: 400, message: t('cart.maxStock', { stock: item.book.stock }) };
      }
      if (txErr.message === 'ITEM_NOT_FOUND') {
        return { success: false, status: 404, message: t('cart.itemNotFound') };
      }
      throw txErr;
    }

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateBookCache(item.book.id);
    emitBooksUpdated();

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

    await invalidateBookCache(item.book.id);
    emitBooksUpdated();

    return { success: true, status: 200, data: serializeCart(updatedCart), message: t('cart.removeSuccess') };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('cart.removeError') };
  }
};