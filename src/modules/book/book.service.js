import * as bookRepo from './book.repository.js';
import redisClient from '../../core/config/redis.client.js';
import { getIO } from '../../core/config/socket.config.js';


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
    stock: book.stock,
    avatar_url: book.cover_url,
    avatar_key: book.cover_key,
  };
};

export const getAllBooks = async (page = 1, limit = 10, search = "") => {
  try {
    const pageNumber = Math.max(1, parseInt(page) || 1);
    const limitNumber = Math.max(1, parseInt(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;
    const { books, totalCount } = await bookRepo.getAllBooks(skip, limitNumber, search);
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
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ في السيرفر" };
  }
};

export const getBookById = async (id) => {
  try {
    const cachedBook = await redisClient.get(`books:${id}`);
    if (cachedBook) {
      return { success: true, status: 200, data: { user: JSON.parse(cachedBook) } };
    }

    const book = await bookRepo.getBookById(id);
    if (!book) {
      return { success: false, status: 404, message: "الكتاب غير موجود" };
    }

    const serialized = serializeBook(book);
    await redisClient.set(`books:${id}`, JSON.stringify(serialized), { EX: 3600 });

    return { success: true, status: 200, data: { user: serialized } };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ في السيرفر" };
  }
};

export const addBook = async (bookData) => {
  try {
    const emailExists = await bookRepo.getBookByEmail(bookData.email);
    if (emailExists) {
      return { success: false, status: 400, errors: { email: ["الايميل مكرر"] } };
    }

    await bookRepo.createBook(bookData);

    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del('books:all');
      }
    } catch (redisErr) {
      console.log("تخطي خطأ مسح الكاش من Redis أثناء الإضافة");
    }

    getIO().emit('books_updated');

    return { success: true, status: 201, message: "تم إضافة الكتاب بنجاح" };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ أثناء الحفظ في قاعدة البيانات" };
  }
};

export const deleteBook = async (id) => {
  try {
    await bookRepo.deleteBook(id);
    await redisClient.del(['books:all', `books:${id}`]);
    getIO().emit('books_updated');
    return { success: true, status: 200, message: "تم حذف الكتاب بنجاح" };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "خطـأ في عملية المسح" };
  }
};

export const editBook = async (id, bookData) => {
  try {
    const emailConflict = await bookRepo.checkEmailForOtherBook(bookData.email, id);
    if (emailConflict) {
      return { success: false, status: 400, message: "هذا البريد الإلكتروني مستخدم بالفعل لكتاب آخر" };
    }
    await bookRepo.updateBook(id, bookData);

    try {
      if (typeof redisClient !== 'undefined') {
        await redisClient.del(['books:all', `books:${id}`]);
      }
    } catch (redisErr) {
      console.log("تخطي خطأ مسح الكاش من Redis");
    }
    getIO().emit('books_updated');
    return { success: true, status: 200, message: "تم تعديل بيانات الكتاب بنجاح" };

  } catch (err) {
    console.error("خطأ الباك إند في التعديل:", err);

    if (err.code === 'P2025') {
      return { success: false, status: 404, message: "الكتاب غير موجود" };
    }

    return { success: false, status: 500, message: "حدث خطأ في السيرفر أثناء التعديل" };
  }
};

export const getPopularBooks = async (limit = 10) => {
  try {
    const limitNumber = Math.max(1, Math.min(50, parseInt(limit) || 10));
    const books = await bookRepo.getPopularBooks(limitNumber);

    return {
      success: true,
      status: 200,
      data: { users: books.map(serializeBook) }
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: "حدث خطأ في السيرفر" };
  }
};