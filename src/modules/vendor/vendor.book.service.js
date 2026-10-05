import * as bookRepo from '../book/book.repository.js';
import * as categoryRepo from '../category/category.repository.js';
import { serializeBook } from '../book/book.service.js';
import { getIO } from '../../core/config/socket.config.js';
import redisClient from '../../core/config/redis.client.js';
import logger from '../../core/logger.js';

const invalidateBooksCache = async (id) => {
  try {
    await redisClient.del(['books:all', `books:${id}`]);
  } catch (err) {
    logger.warn({ err }, 'تخطي خطأ مسح الكاش من Redis');
  }
};

export const getMyBooks = async (t, vendorId, page = 1, limit = 10) => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    const { books, totalCount } = await bookRepo.getBooksByVendor(vendorId, skip, limitNumber);
    const totalPages = Math.ceil(totalCount / limitNumber) || 1;

    return {
      success: true,
      status: 200,
      data: {
        users: books.map(serializeBook),
        pagination: { totalCount, totalPages, currentPage: pageNumber, limit: limitNumber }
      }
    };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const getMyBookById = async (t, vendorId, id) => {
  try {
    const book = await bookRepo.getVendorBookById(vendorId, id);
    if (!book) {
      return { success: false, status: 404, message: t('book.notFound') };
    }
    return { success: true, status: 200, data: { user: serializeBook(book) } };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const addMyBook = async (t, vendorId, bookData) => {
  try {
    const category = await categoryRepo.findCategoryBySlug(bookData.category);
    if (!category) {
      return { success: false, status: 400, message: t('book.validation.categoryInvalid'), errors: { category: [t('book.validation.categoryInvalid')] } };
    }

    await bookRepo.createBook({ ...bookData, category_id: category.id }, vendorId);
    await invalidateBooksCache('all');
    getIO().emit('books_updated');

    return { success: true, status: 201, message: t('book.added') };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('book.addError') };
  }
};

export const editMyBook = async (t, vendorId, id, bookData) => {
  try {
    const updated = await bookRepo.updateVendorBook(vendorId, id, bookData);
    if (!updated) {
      return { success: false, status: 404, message: t('book.notFound') };
    }

    await invalidateBooksCache(id);
    getIO().emit('books_updated');

    return { success: true, status: 200, message: t('book.updated') };
  } catch (err) {
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('book.updateError') };
  }
};

export const deleteMyBook = async (t, vendorId, id) => {
  try {
    const deleted = await bookRepo.deleteVendorBook(vendorId, id);
    if (!deleted) {
      return { success: false, status: 404, message: t('book.notFound') };
    }

    await invalidateBooksCache(id);
    getIO().emit('books_updated');

    return { success: true, status: 200, message: t('book.deleted') };
  } catch (err) {
    const isFk = err.code === 'P2003' || /foreign key|RESTRICT/i.test(err.message || '');
    if (isFk) {
      return { success: false, status: 409, message: t('book.deleteForeignKey') };
    }
    logger.error({ err }, 'Unhandled error');
    return { success: false, status: 500, message: t('book.deleteError') };
  }
};