import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.client.js';

export const loginLimiter = rateLimit({
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

export const signupLimiter = rateLimit({
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

export const forgotPasswordLimiter = rateLimit({
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

export const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:contact:',
  }),
  message: {
    success: false,
    message: 'لقد أرسلت رسايل كتير، حاول تاني بعد شوية'
  }
});

export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() ?? req.ip,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:checkout:',
  }),
  message: {
    success: false,
    message: 'لقد حاولت الدفع مرات كتيرة. برجاء الانتظار شوية والمحاولة تاني.'
  }
});