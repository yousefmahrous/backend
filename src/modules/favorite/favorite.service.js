import * as favoriteRepo from './favorite.repository.js';
import logger from '../../core/logger.js';

const serializeFavorite = (fav) => ({
  id: fav.id,
  product: {
    id: String(fav.product.id),
    name: fav.product.title,
    number: fav.product.isbn,
    category: fav.product.category,
    avatar_url: fav.product.cover_url,
    stock: fav.product.stock
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
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('favorite.loadError') };
  }
};

export const addFavorite = async (t, userId, productId) => {
  try {
    const product = await favoriteRepo.getProductById(productId);
    if (!product) {
      return { success: false, status: 404, message: t('favorite.productNotFound') };
    }

    const existing = await favoriteRepo.findFavorite(userId, productId);
    if (existing) {
      return { success: false, status: 400, message: t('favorite.alreadyExists') };
    }

    await favoriteRepo.addFavorite(userId, productId);

    const updatedFavorites = await favoriteRepo.getFavoritesByUser(userId);
    return {
      success: true,
      status: 201,
      data: serializeFavorites(updatedFavorites),
      message: t('favorite.addSuccess')
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('favorite.addError') };
  }
};

export const removeFavorite = async (t, userId, productId) => {
  try {
    const existing = await favoriteRepo.findFavorite(userId, productId);
    if (!existing) {
      return { success: false, status: 404, message: t('favorite.notInFavorites') };
    }

    await favoriteRepo.removeFavorite(userId, productId);

    const updatedFavorites = await favoriteRepo.getFavoritesByUser(userId);
    return {
      success: true,
      status: 200,
      data: serializeFavorites(updatedFavorites),
      message: t('favorite.removeSuccess')
    };
  } catch (err) {
    logger.error({ err: err }, 'Unhandled error');
    return { success: false, status: 500, message: t('favorite.removeError') };
  }
};