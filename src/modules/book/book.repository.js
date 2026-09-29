import prisma from '../../core/db.js';
import { getPlatformVendorId } from '../vendor/vendor.repository.js';

export const getAllBooks = async (skip, take, search = "", category = "") => {
  const searchCondition = search ? {
    OR: [
      { title: { path: ['ar'], string_contains: search } },
      { title: { path: ['en'], string_contains: search } },
    ]
  } : {};

  const whereCondition = {
    ...searchCondition,
    ...(category ? { category } : {}),
    status: 'published',
    vendor: { status: 'active' }
  };

  const [books, totalCount] = await Promise.all([
    prisma.book.findMany({
      where: whereCondition,
      skip: skip,
      take: take,
      orderBy: { id: 'desc' },
      include: { variants: true }
    }),
    prisma.book.count({
      where: whereCondition
    })
  ]);

  return { books, totalCount };
};

export const getBookById = async (id) => {
  const book = await prisma.book.findUnique({
    where: { id: parseInt(id) },
    include: { variants: true, vendor: { select: { status: true } } }
  });
  return book;
};

export const getBookByEmail = async (email) => {
  const book = await prisma.book.findFirst({
    where: { publisher_email: email },
    select: { id: true }
  });
  return book;
};

export const createBook = async (bookData, vendorId) => {
  const ownerVendorId = vendorId ?? (await getPlatformVendorId());
  let coverUrl = null;

  if (bookData.avatar_key) {
    const endpointHost = process.env.B2_ENDPOINT.replace('https://', '');
    coverUrl = `https://${process.env.B2_BUCKET_NAME}.${endpointHost}/${bookData.avatar_key}`;
  }

  const newBook = await prisma.$transaction(async (tx) => {
    const book = await tx.book.create({
      data: {
        title: bookData.name,
        isbn: bookData.number,
        publisher_email: bookData.email,
        description: bookData.adress,
        publisher: bookData.centre,
        category: bookData.category,
        category_id: bookData.category_id,
        stock: bookData.stock,
        price: bookData.price,
        cover_key: bookData.avatar_key || null,
        cover_url: coverUrl,
        vendor_id: ownerVendorId,
      }
    });

    await tx.productVariant.create({
      data: {
        product_id: book.id,
        barcode: bookData.number,
        price: bookData.price,
        stock: bookData.stock
      }
    });

    return book;
  });

  return newBook;
};

export const deleteBook = async (id) => {
  const deletedBook = await prisma.book.delete({
    where: { id: parseInt(id) }
  });
  return deletedBook;
};

export const checkEmailForOtherBook = async (email, id) => {
  const existingBook = await prisma.book.findFirst({
    where: {
      publisher_email: email,
      id: {
        not: parseInt(id)
      }
    }
  });

  return existingBook !== null;
};

export const updateBook = async (id, bookData) => {
  const bookId = parseInt(id);

  const updatedBook = await prisma.$transaction(async (tx) => {
    const book = await tx.book.update({
      where: { id: bookId },
      data: {
        title: bookData.name,
        description: bookData.adress,
        publisher_email: bookData.email,
        stock: bookData.stock,
        price: bookData.price
      }
    });

    await tx.productVariant.updateMany({
      where: { product_id: bookId },
      data: { stock: bookData.stock, price: bookData.price }
    });

    return book;
  });

  return updatedBook;
};

export const getPopularBooks = async (limit = 10) => {
  return prisma.book.findMany({
    where: { status: 'published', vendor: { status: 'active' } },
    orderBy: { popularity_score: 'desc' },
    take: limit,
    include: { variants: true }
  });
};