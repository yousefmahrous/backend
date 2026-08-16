import * as favoriteRepo from './favorite.repository.js';

const serializeFavorite = (fav) => ({
  id: fav.id,
  book: {
    id: fav.book.id,
    name: fav.book.title,
    number: fav.book.isbn,
    category: fav.book.category,
    avatar_url: fav.book.cover_url,
    stock: fav.book.stock
  }
});

const serializeFavorites = (favorites) => ({
  items: favorites.map(serializeFavorite),
  itemsCount: favorites.length
});

export const getFavorites = async (userId) => {
  try {
    const favorites = await favoriteRepo.getFavoritesByUser(userId);
    return { success: true, status: 200, data: serializeFavorites(favorites) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء تحميل المفضلة' };
  }
};

export const addFavorite = async (userId, bookId) => {
  try {
    const book = await favoriteRepo.getBookById(bookId);
    if (!book) {
      return { success: false, status: 404, message: 'الكتاب غير موجود' };
    }

    const existing = await favoriteRepo.findFavorite(userId, bookId);
    if (existing) {
      return { success: false, status: 400, message: 'الكتاب موجود بالفعل في المفضلة' };
    }

    await favoriteRepo.addFavorite(userId, bookId);

    const updatedFavorites = await favoriteRepo.getFavoritesByUser(userId);
    return {
      success: true,
      status: 201,
      data: serializeFavorites(updatedFavorites),
      message: 'تم إضافة الكتاب للمفضلة'
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء الإضافة للمفضلة' };
  }
};

export const removeFavorite = async (userId, bookId) => {
  try {
    const existing = await favoriteRepo.findFavorite(userId, bookId);
    if (!existing) {
      return { success: false, status: 404, message: 'الكتاب مش موجود في المفضلة' };
    }

    await favoriteRepo.removeFavorite(userId, bookId);

    const updatedFavorites = await favoriteRepo.getFavoritesByUser(userId);
    return {
      success: true,
      status: 200,
      data: serializeFavorites(updatedFavorites),
      message: 'تم حذف الكتاب من المفضلة'
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: 'حدث خطأ أثناء الحذف من المفضلة' };
  }
};