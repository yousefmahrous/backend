import prisma from '../../core/db.js';

export const getBookById = async (bookId) => {
  return prisma.book.findUnique({ where: { id: bookId } });
};

export const getReviewsByBook = async (bookId, skip, take) => {
  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where: { book_id: bookId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take
    }),
    prisma.review.count({ where: { book_id: bookId } })
  ]);

  return { reviews, totalCount };
};

export const findReview = async (userId, bookId) => {
  return prisma.review.findUnique({
    where: { user_id_book_id: { user_id: userId, book_id: bookId } }
  });
};

export const getReviewById = async (id) => {
  return prisma.review.findUnique({ where: { id } });
};

const recalculateBookRating = async (tx, bookId) => {
  const aggregate = await tx.review.aggregate({
    where: { book_id: bookId },
    _avg: { rating: true },
    _count: { rating: true }
  });

  const ratingAverage = aggregate._avg.rating
    ? Math.round(aggregate._avg.rating * 10) / 10
    : 0;

  await tx.book.update({
    where: { id: bookId },
    data: {
      rating_average: ratingAverage,
      reviews_count: aggregate._count.rating
    }
  });

  return { ratingAverage, reviewsCount: aggregate._count.rating };
};

export const upsertReview = async (userId, bookId, rating, comment) => {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.upsert({
      where: { user_id_book_id: { user_id: userId, book_id: bookId } },
      update: { rating, comment },
      create: { user_id: userId, book_id: bookId, rating, comment },
      include: { user: { select: { id: true, name: true } } }
    });

    const bookRating = await recalculateBookRating(tx, bookId);

    return { review, bookRating };
  });
};

export const deleteReview = async (id, bookId) => {
  return prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });
    const bookRating = await recalculateBookRating(tx, bookId);
    return { bookRating };
  });
};