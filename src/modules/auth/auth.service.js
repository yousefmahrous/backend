import bcrypt from 'bcrypt';
import * as repository from './auth.repository.js';
import { sendWelcomeEmail, sendResetPasswordEmail } from '../../core/services/email.service.js';
import crypto from 'crypto';
import redisClient from '../../core/config/redis.client.js';
import { addWelcomeEmailJob, addResetPasswordEmailJob } from '../../core/email.queue.js';

export const signup = async (data) => {
  const existingUser = await repository.findUserByEmail(data.email);
  if (existingUser) {
    throw new Error('الإيميل ده مستخدم قبل كده');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(data.password, salt);

  const newUser = await repository.createUser(data.name, data.email, hashedPassword);

  await addWelcomeEmailJob(data.email, data.name);

  return newUser;
};

export const login = async (data) => {
  const user = await repository.findUserByEmail(data.email);
  if (!user) {
    throw new Error('الإيميل أو كلمة المرور غير صحيحة');
  }

  const isMatch = await bcrypt.compare(data.password, user.password);
  if (!isMatch) {
    throw new Error('الإيميل أو كلمة المرور غير صحيحة');
  }

  const normalizedRole = user.role ? user.role.toLowerCase() : 'customer';

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizedRole
  };
};

export const forgotPassword = async (email) => {
  const user = await repository.findUserByEmail(email);
  if (!user) {
    return;
  }
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000);

  await repository.saveResetToken(user.id, resetToken, expiresAt);

  const resetLink = `${process.env.CLIENT_URL_DEV_4}/reset-password?token=${resetToken}`;
  await addResetPasswordEmailJob(email, resetLink);
};

export const resetPassword = async (token, newPassword) => {

  const user = await repository.findUserByResetToken(token);
  if (!user) {
    throw new Error('الرابط غير صالح أو انتهت صلاحيته.');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await repository.updatePasswordAndClearToken(user.id, hashedPassword);

  await destroyAllUserSessions(user.id);

};

export const changePassword = async (userId, oldPassword, newPassword) => {

  const user = await repository.findUserById(userId);
  if (!user) {
    throw new Error('المستخدم غير موجود');
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new Error('كلمة المرور القديمة غير صحيحة');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await repository.updatePassword(userId, hashedPassword);

  await destroyAllUserSessions(userId);

};

const destroyAllUserSessions = async (userId) => {
  try {
    const keys = await redisClient.keys('sess:*');

    for (const key of keys) {
      const sessionDataRaw = await redisClient.get(key);

      if (sessionDataRaw) {
        const sessionData = JSON.parse(sessionDataRaw);

        if (sessionData.user && sessionData.user.id === userId) {
          await redisClient.del(key);
        }
      }
    }
  } catch (error) {
    console.error('حدث خطأ أثناء إلغاء جلسات المستخدم من Redis:', error);
  }
};
