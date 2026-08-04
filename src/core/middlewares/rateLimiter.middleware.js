const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('../config/redis.client');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 3, 
  standardHeaders: true, 
  legacyHeaders: false, 
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:login:',
  }),
  message: { 
    success: false,
    message: 'عفواً، قمت بمحاولات تسجيل دخول كثيرة خاطئة. يرجى الانتظار 15 دقيقة ثم المحاولة مجدداً.' 
  }
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3, 
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:signup:',
  }),
  message: { 
    success: false,
    message: 'تم تجاوز الحد الأقصى لإنشاء الحسابات من هذا الجهاز. يرجى المحاولة لاحقاً.' 
  }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 3, 
  standardHeaders: true, 
  legacyHeaders: false, 
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:forgot:',
  }),
  message: { 
    success: false,
    message: 'لقد وصلت للحد الأقصى لمحاولات تغيير كلمة المرور يرجى المحاولة لاحقا' 
  }
});

module.exports = {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter
};