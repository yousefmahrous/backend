import prisma from '../../core/db.js';

export const getFavoritesByUser = async (userId) => {
  return prisma.favorite.findMany({
    where: { user_id: userId },
    include: { product: true },
    orderBy: { created_at: 'desc' }
  });
};

export const findFavorite = async (userId, productId) => {
  return prisma.favorite.findUnique({
    where: { user_id_product_id: { user_id: userId, product_id: productId } }
  });
};

export const addFavorite = async (userId, productId) => {
  return prisma.$transaction(async (tx) => {
    const favorite = await tx.favorite.create({
      data: { user_id: userId, product_id: productId },
      include: { product: true }
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        favorites_count: { increment: 1 },
        popularity_score: { increment: 1 }
      }
    });

    return favorite;
  });
};

export const removeFavorite = async (userId, productId) => {
  return prisma.favorite.delete({
    where: { user_id_product_id: { user_id: userId, product_id: productId } }
  });
};

export const getProductById = async (productId) => {
  return prisma.product.findUnique({ where: { id: productId } });
};