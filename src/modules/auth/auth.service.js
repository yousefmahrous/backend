const bcrypt = require('bcrypt');
const repository = require('./auth.repository');
const { sendWelcomeEmail, sendResetPasswordEmail } = require('../../core/services/email.service');
const crypto = require('crypto');
const redisClient = require('../../core/config/redis.client');
const { addWelcomeEmailJob, addResetPasswordEmailJob } = require('../../core/email.queue');

const signup = async (data) => {
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


const login = async (data) => {
  const user = await repository.findUserByEmail(data.email);
  if (!user) {
    throw new Error('الإيميل أو كلمة المرور غير صحيحة');
  }

  const isMatch = await bcrypt.compare(data.password, user.password);
  if (!isMatch) {
    throw new Error('الإيميل أو كلمة المرور غير صحيحة');
  }

  const normalizedRole = user.role ? user.role.toLowerCase() : 'student';

  return { 
    id: user.id, 
    name: user.name, 
    email: user.email, 
    role: normalizedRole 
  };
};

const forgotPassword = async (email) => {
  const user = await repository.findUserByEmail(email);
  if (!user) {
    return;
  }
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000);

  await repository.saveResetToken(user.id, resetToken, expiresAt);

  const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
  await addResetPasswordEmailJob(email, resetLink);
};

const resetPassword = async (token, newPassword) => {

  const user = await repository.findUserByResetToken(token);
  if (!user) {
    throw new Error('الرابط غير صالح أو انتهت صلاحيته.');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await repository.updatePasswordAndClearToken(user.id, hashedPassword);

  await destroyAllUserSessions(user.id);

};

const changePassword = async (userId, oldPassword, newPassword) => {

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

/**
@param {number|string} userId
 */

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

module.exports = { signup, login, forgotPassword, resetPassword, changePassword };