import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.client.js';

const skipInTests = () => process.env.DISABLE_RATE_LIMIT === 'true';

function localizedHandler(messageKey) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      message: req.t ? req.t(messageKey) : undefined,
    });
  };
}

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
  handler: localizedHandler('common.rateLimit.login'),
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
  handler: localizedHandler('common.rateLimit.signup'),
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
  handler: localizedHandler('common.rateLimit.forgotPassword'),
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
  handler: localizedHandler('common.rateLimit.resendVerification'),
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
  handler: localizedHandler('common.rateLimit.contact'),
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
  handler: localizedHandler('common.rateLimit.checkout'),
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
  handler: localizedHandler('common.rateLimit.global'),
});