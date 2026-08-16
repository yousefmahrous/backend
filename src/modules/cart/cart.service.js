import * as cartRepo from './cart.repository.js';
import { getIO } from '../../core/config/socket.config.js';
import redisClient from '../../core/config/redis.client.js';

const serializeCartItem = (item) => ({
  id: item.id,
  quantity: item.quantity,
  book: {
    id: item.book.id,
    name: item.book.title,
    number: item.book.isbn,
    category: item.book.category,
    avatar_url: item.book.cover_url,
    stock: item.book.stock
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
    console.log('تخطي خطأ إرسال حدث تحديث الكتب عبر السوكيت');
  }
};

const invalidateBookCache = async (bookId) => {
  try {
    await redisClient.del(['books:all', `books:${bookId}`]);
  } catch (redisErr) {
    console.log('تخطي خطأ مسح الكاش من Redis أثناء تحديث الكمية');
  }
};

export const getCart = async (userId) => {
  try {
    const cart = await cartRepo.getOrCreateCart(userId);
    return { success: true, status: 200, data: serializeCart(cart) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل العربية' };
  }
};

export const addToCart = async (userId, bookId) => {
  try {
    const book = await cartRepo.getBookById(bookId);
    if (!book) {
      return { success: false, status: 404, message: 'الكتاب غير موجود' };
    }

    const cart = await cartRepo.getOrCreateCart(userId);

    try {

      await cartRepo.reserveAndAddItem(cart.id, bookId, 1);
    } catch (txErr) {
      if (txErr.message === 'OUT_OF_STOCK') {
        return { success: false, status: 400, message: 'الكمية المتاحة من الكتاب خلصت' };
      }
      throw txErr;
    }

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateBookCache(bookId);
    emitBooksUpdated();

    return { success: true, status: 201, data: serializeCart(updatedCart), message: 'تم إضافة الكتاب للعربية' };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء الإضافة للعربية' };
  }
};

export const updateQuantity = async (userId, itemId, quantity) => {
  try {
    if (quantity < 1) {
      return { success: false, status: 400, message: 'الكمية لازم تكون 1 على الأقل' };
    }

    const cart = await cartRepo.getOrCreateCart(userId);
    const item = await cartRepo.findCartItem(cart.id, itemId);
    if (!item) {
      return { success: false, status: 404, message: 'العنصر غير موجود في عربيتك' };
    }

    try {

      await cartRepo.reserveAndUpdateQuantity(itemId, quantity);
    } catch (txErr) {
      if (txErr.message === 'OUT_OF_STOCK') {
        return { success: false, status: 400, message: `أقصى كمية متاحة من الكتاب ده هي ${item.book.stock}` };
      }
      if (txErr.message === 'ITEM_NOT_FOUND') {
        return { success: false, status: 404, message: 'العنصر غير موجود في عربيتك' };
      }
      throw txErr;
    }

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateBookCache(item.book.id);
    emitBooksUpdated();

    return { success: true, status: 200, data: serializeCart(updatedCart) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحديث الكمية' };
  }
};

export const removeFromCart = async (userId, itemId) => {
  try {
    const cart = await cartRepo.getOrCreateCart(userId);
    const item = await cartRepo.findCartItem(cart.id, itemId);
    if (!item) {
      return { success: false, status: 404, message: 'العنصر غير موجود في عربيتك' };
    }
    await cartRepo.releaseAndRemoveItem(itemId);

    const updatedCart = await cartRepo.getOrCreateCart(userId);

    await invalidateBookCache(item.book.id);
    emitBooksUpdated();

    return { success: true, status: 200, data: serializeCart(updatedCart), message: 'تم حذف الكتاب من العربية' };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء الحذف من العربية' };
  }
};
