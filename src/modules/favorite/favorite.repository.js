import prisma from '../../core/db.js';

export const getFavoritesByUser = async (userId) => {
  return prisma.favorite.findMany({
    where: { user_id: userId },
    include: { book: true },
    orderBy: { created_at: 'desc' }
  });
};

export const findFavorite = async (userId, bookId) => {
  return prisma.favorite.findUnique({
    where: { user_id_book_id: { user_id: userId, book_id: bookId } }
  });
};

export const addFavorite = async (userId, bookId) => {
  return prisma.$transaction(async (tx) => {
    const favorite = await tx.favorite.create({
      data: { user_id: userId, book_id: bookId },
      include: { book: true }
    });

    await tx.book.update({
      where: { id: bookId },
      data: {
        favorites_count: { increment: 1 },
        popularity_score: { increment: 1 }
      }
    });

    return favorite;
  });
};

export const removeFavorite = async (userId, bookId) => {
  return prisma.favorite.delete({
    where: { user_id_book_id: { user_id: userId, book_id: bookId } }
  });
};

export const getBookById = async (bookId) => {
  return prisma.book.findUnique({ where: { id: bookId } });
};