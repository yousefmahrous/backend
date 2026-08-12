import prisma from '../../core/db.js';

export const getAllBooks = async (skip, take, search = "") => {
  const whereCondition = search ? {
    title: {
      contains: search,
    }
  } : {};

  const [books, totalCount] = await Promise.all([
    prisma.book.findMany({
      where: whereCondition,
      skip: skip,
      take: take,
      orderBy: { id: 'desc' }
    }),
    prisma.book.count({
      where: whereCondition
    })
  ]);

  return { books, totalCount };
};

export const getBookById = async (id) => {
  const book = await prisma.book.findUnique({
    where: { id: parseInt(id) }
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

export const createBook = async (bookData) => {
  let coverUrl = null;

  if (bookData.avatar_key) {
    const endpointHost = process.env.B2_ENDPOINT.replace('https://', '');
    coverUrl = `https://${process.env.B2_BUCKET_NAME}.${endpointHost}/${bookData.avatar_key}`;
  }

  const newBook = await prisma.book.create({
    data: {
      title: bookData.name,
      isbn: bookData.number,
      publisher_email: bookData.email,
      description: bookData.adress,
      publisher: bookData.centre,
      category: bookData.grade,
      cover_key: bookData.avatar_key || null,
      cover_url: coverUrl,
    }
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
  const updatedBook = await prisma.book.update({
    where: { id: parseInt(id) },
    data: {
      title: bookData.name,
      publisher_email: bookData.email
    }
  });
  return updatedBook;
};
