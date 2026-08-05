const prisma = require('../../core/db');

const findUserByEmail = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email: email }
  });
  return user;
};

const createUser = async (name, email, hashedPassword) => {
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

const saveResetToken = async (userId, token, expiresAt) => {
  await prisma.user.update({
    where: { id: parseInt(userId) },
    data: {
      reset_password_token: token,
      reset_password_expires: expiresAt
    }
  });
};

const findUserByResetToken = async (token) => {
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

const updatePasswordAndClearToken = async (userId, hashedPassword) => {
  await prisma.user.update({
    where: { id: parseInt(userId) },
    data: {
      password: hashedPassword,
      reset_password_token: null,
      reset_password_expires: null
    }
  });
};

module.exports = { 
  findUserByEmail, 
  createUser, 
  saveResetToken, 
  findUserByResetToken, 
  updatePasswordAndClearToken 
};