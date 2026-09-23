import prisma from '../../core/db.js';

export const findCategoryBySlug = async (slug) => {
  return prisma.category.findUnique({
    where: { slug },
    select: { id: true, slug: true }
  });
};