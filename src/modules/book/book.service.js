import * as bookRepo from './book.repository.js';
import * as categoryRepo from '../category/category.repository.js';
import redisClient from '../../core/config/redis.client.js';
import { getIO } from '../../core/config/socket.config.js';
import logger from '../../core/logger.js';


const serializeBook = (book) => {
  if (!book) return book;
  return {
    id: book.id,
    name: book.title,
    number: book.isbn,
    email: book.publisher_email,
    adress: book.description,
    centre: book.publisher,
    category: book.category,
    price: book.price,
    stock: book.stock,
    avatar_url: book.cover_url,
    avatar_key: book.cover_key,
  };
};

export const getAllBooks = async (t, page = 1, limit = 10, search = "", category = "") => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;
    const { books, totalCount } = await bookRepo.getAllBooks(skip, limitNumber, search, category);
    const totalPages = Math.ceil(totalCount / limitNumber);

    return {
      success: true,
      status: 200,
      data: {
        users: books.map(serializeBook),
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

export const getBookById = async (t, id) => {
  try {
    const cachedBook = await redisClient.get(`books:${id}`);
    if (cachedBook) {
      return { success: true, status: 200, data: { user: JSON.parse(cachedBook) } };
    }

    const book = await bookRepo.getBookById(id);
    if (!book) {
      return { success: false, status: 404, message: t('book.notFound') };
    }

    const serialized = serializeBook(book);
    await redisClient.set(`books:${id}`, JSON.stringify(serialized), { EX: 3600 });

    return { success: true, status: 200, data: { user: serialized } };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};

export const addBook = async (t, bookData) => {
  try {
    const category = await categoryRepo.findCategoryBySlug(bookData.category);
    if (!category) {
      return {
        success: false,
        status: 400,
        errors: { category: [t('book.validation.categoryInvalid')] }
      };
    }

    await bookRepo.createBook({ ...bookData, category_id: category.id });

    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del('books:all');
      }
    } catch (redisErr) {
      logger.warn({ err: redisErr }, 'تخطي خطأ مسح الكاش من Redis أثناء الإضافة');
    }

    getIO().emit('books_updated');

    return { success: true, status: 201, message: t('book.added') };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('book.addError') };
  }
};

export const deleteBook = async (t, id) => {
  try {
    await bookRepo.deleteBook(id);
    await redisClient.del(['books:all', `books:${id}`]);
    getIO().emit('books_updated');
    return { success: true, status: 200, message: t('book.deleted') };
  } catch (err) {
    const isForeignKeyError =
      err.code === 'P2003' ||
      err.code === 'P2039' ||
      /foreign key|RESTRICT/i.test(err.message || '');

    if (isForeignKeyError) {
      return {
        success: false,
        status: 409,
        message: t('book.deleteForeignKey')
      };
    }
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('book.deleteError') };
  }
};

export const editBook = async (t, id, bookData) => {
  try {
    await bookRepo.updateBook(id, bookData);

    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del(['books:all', `books:${id}`]);
      }
    } catch (redisErr) {
      logger.warn({ err: redisErr }, 'تخطي خطأ مسح الكاش من Redis');
    }
    getIO().emit('books_updated');
    return { success: true, status: 200, message: t('book.updated') };

  } catch (err) {
    logger.error({ err: err }, 'خطأ الباك إند في التعديل');

    if (err.code === 'P2025') {
      return { success: false, status: 404, message: t('book.notFound') };
    }

    return { success: false, status: 500, message: t('book.updateError') };
  }
};

export const getPopularBooks = async (t, limit = 10) => {
  try {
    const limitNumber = Math.max(1, Math.min(50, parseInt(limit) || 10));
    const books = await bookRepo.getPopularBooks(limitNumber);

    return {
      success: true,
      status: 200,
      data: { users: books.map(serializeBook) }
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('common.serverError') };
  }
};