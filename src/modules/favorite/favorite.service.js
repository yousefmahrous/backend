import * as favoriteRepo from './favorite.repository.js';

const serializeFavorite = (fav) => ({
  id: fav.id,
  book: {
    id: String(fav.book.id),
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

export const getFavorites = async (t, userId) => {
  try {
    const favorites = await favoriteRepo.getFavoritesByUser(userId);
    return { success: true, status: 200, data: serializeFavorites(favorites) };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('favorite.loadError') };
  }
};

export const addFavorite = async (t, userId, bookId) => {
  try {
    const book = await favoriteRepo.getBookById(bookId);
    if (!book) {
      return { success: false, status: 404, message: t('favorite.bookNotFound') };
    }

    const existing = await favoriteRepo.findFavorite(userId, bookId);
    if (existing) {
      return { success: false, status: 400, message: t('favorite.alreadyExists') };
    }

    await favoriteRepo.addFavorite(userId, bookId);

    const updatedFavorites = await favoriteRepo.getFavoritesByUser(userId);
    return {
      success: true,
      status: 201,
      data: serializeFavorites(updatedFavorites),
      message: t('favorite.addSuccess')
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('favorite.addError') };
  }
};

export const removeFavorite = async (t, userId, bookId) => {
  try {
    const existing = await favoriteRepo.findFavorite(userId, bookId);
    if (!existing) {
      return { success: false, status: 404, message: t('favorite.notInFavorites') };
    }

    await favoriteRepo.removeFavorite(userId, bookId);

    const updatedFavorites = await favoriteRepo.getFavoritesByUser(userId);
    return {
      success: true,
      status: 200,
      data: serializeFavorites(updatedFavorites),
      message: t('favorite.removeSuccess')
    };
  } catch (err) {
    console.error(err);
    return { success: false, status: 500, message: t('favorite.removeError') };
  }
};