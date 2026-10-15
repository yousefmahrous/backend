import prisma from '../../core/db.js';

export const getProductById = async (productId) => {
  return prisma.product.findUnique({ where: { id: productId } });
};

export const getReviewsByProduct = async (productId, skip, take) => {
  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where: { product_id: productId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take
    }),
    prisma.review.count({ where: { product_id: productId } })
  ]);

  return { reviews, totalCount };
};

export const findReview = async (userId, productId) => {
  return prisma.review.findUnique({
    where: { user_id_product_id: { user_id: userId, product_id: productId } }
  });
};

export const getReviewById = async (id) => {
  return prisma.review.findUnique({ where: { id } });
};

const recalculateProductRating = async (tx, productId) => {
  const aggregate = await tx.review.aggregate({
    where: { product_id: productId },
    _avg: { rating: true },
    _count: { rating: true }
  });

  const ratingAverage = aggregate._avg.rating
    ? Math.round(aggregate._avg.rating * 10) / 10
    : 0;

  await tx.product.update({
    where: { id: productId },
    data: {
      rating_average: ratingAverage,
      reviews_count: aggregate._count.rating
    }
  });

  return { ratingAverage, reviewsCount: aggregate._count.rating };
};

export const upsertReview = async (userId, productId, rating, comment) => {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.upsert({
      where: { user_id_product_id: { user_id: userId, product_id: productId } },
      update: { rating, comment },
      create: { user_id: userId, product_id: productId, rating, comment },
      include: { user: { select: { id: true, name: true } } }
    });

    const productRating = await recalculateProductRating(tx, productId);

    return { review, productRating };
  });
};

export const deleteReview = async (id, productId) => {
  return prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });
    const productRating = await recalculateProductRating(tx, productId);
    return { productRating };
  });
};