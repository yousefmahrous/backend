import prisma from '../../core/db.js';

export const findCategoryBySlug = async (slug) => {
  return prisma.category.findUnique({
    where: { slug },
    select: { id: true, slug: true }
  });
};

export const findAllCategories = async () => {
  return prisma.category.findMany({ orderBy: { id: 'asc' } });
};

export const createCategory = async (data) => {
  return prisma.category.create({ data });
};

export const updateCategory = async (id, data) => {
  const result = await prisma.category.updateMany({ where: { id }, data });
  return result.count > 0;
};

export const deleteCategory = async (id) => {
  return prisma.category.delete({ where: { id } });
};