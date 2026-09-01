import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.client.js';

const skipInTests = () => process.env.DISABLE_RATE_LIMIT === 'true';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
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
  skip: skipInTests,
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
  skip: skipInTests,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:forgot:',
  }),
  message: {
    success: false,
    message: 'لقد وصلت للحد الأقصى لمحاولات تغيير كلمة المرور يرجى المحاولة لاحقا'
  }
});

export const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:resend-verify:',
  }),
  message: {
    success: false,
    message: 'لقد طلبت رابط التأكيد مرات كتيرة. برجاء الانتظار شوية والمحاولة تاني.'
  }
});

export const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
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
  skip: skipInTests,
  keyGenerator: (req) => req.user?.id?.toString() ?? ipKeyGenerator(req.ip),
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:checkout:',
  }),
  message: {
    success: false,
    message: 'لقد حاولت الدفع مرات كتيرة. برجاء الانتظار شوية والمحاولة تاني.'
  }
});


export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:global:',
  }),
  message: {
    success: false,
    message: 'طلبات كتيرة جدًا من عنوانك، برجاء الانتظار شوية.'
  }
});