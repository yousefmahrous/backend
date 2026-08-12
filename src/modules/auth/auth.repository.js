import prisma from '../../core/db.js';

export const findUserByEmail = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email: email }
  });
  return user;
};

export const findUserById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(id) }
  });
  return user;
};

export const createUser = async (name, email, hashedPassword) => {
  const newUser = await prisma.user.create({
    data: {
      name: name,
      email: email,
      password: hashedPassword
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });
  return newUser;
};

export const saveResetToken = async (userId, token, expiresAt) => {
  await prisma.user.update({
    where: { id: parseInt(userId) },
    data: {
      reset_password_token: token,
      reset_password_expires: expiresAt
    }
  });
};

export const findUserByResetToken = async (token) => {
  const user = await prisma.user.findFirst({
    where: {
      reset_password_token: token,
      reset_password_expires: {
        gt: new Date()
      }
    }
  });
  return user;
};

export const updatePasswordAndClearToken = async (userId, hashedPassword) => {
  await prisma.user.update({
    where: { id: parseInt(userId) },
    data: {
      password: hashedPassword,
      reset_password_token: null,
      reset_password_expires: null
    }
  });
};

export const updatePassword = async (userId, hashedPassword) => {
  await prisma.user.update({
    where: { id: parseInt(userId) },
    data: {
      password: hashedPassword
    }
  });
};