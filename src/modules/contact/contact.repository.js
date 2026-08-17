import prisma from '../../core/db.js';

export const createContactMessage = async ({ name, email, subject, message }) => {
  return prisma.contactMessage.create({
    data: { name, email, subject, message }
  });
};