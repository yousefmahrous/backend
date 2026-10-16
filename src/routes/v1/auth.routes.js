import express from 'express';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import * as service from '../../modules/auth/auth.service.js';
import * as twofa from '../../modules/auth/twofa.service.js';
import * as repository from '../../modules/auth/auth.repository.js';
import { createSignupSchema, createLoginSchema } from '../../modules/auth/auth.schema.js';
import { doubleCsrfProtection } from '../../core/config/csrf.config.js';
import {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
  twofaLoginLimiter,
  twofaManageLimiter
} from '../../core/middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const validatedData = createSignupSchema(req.t).parse(req.body);
    const newUser = await service.signup(req.t, validatedData, req.lang);
    res.status(201).json({
      message: req.t('auth.signupSuccess'),
      user: newUser
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(400).json({ message: error.message });
  }
});

const PENDING_2FA_TTL_MS = 5 * 60 * 1000;

const regenerateSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );

const saveSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const validatedData = createLoginSchema(req.t).parse(req.body);
    const user = await service.login(req.t, validatedData);

    if (user.requires2fa) {
      await regenerateSession(req);
      req.session.pending2fa = {
        userId: user.id,
        expiresAt: Date.now() + PENDING_2FA_TTL_MS
      };
      await saveSession(req);
      return res.status(200).json({ requires2fa: true });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.status(200).json({
      message: req.t('auth.loginSuccess'),
      user: req.session.user
    });

  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ errors: error.errors });
    }
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      return res.status(403).json({ message: error.message, code: error.code });
    }
    res.status(400).json({ message: error.message });
  }
});

router.post('/login/2fa', twofaLoginLimiter, async (req, res) => {
  try {
    const pending = req.session.pending2fa;
    if (!pending || pending.expiresAt < Date.now()) {
      delete req.session.pending2fa;
      return res.status(401).json({
        message: req.t('auth.twofa.sessionExpired'),
        code: 'PENDING_2FA_EXPIRED'
      });
    }

    const user = await twofa.verifyLogin(req.t, pending.userId, req.body?.code);

    await regenerateSession(req);
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.status(200).json({
      message: req.t('auth.loginSuccess'),
      user: req.session.user
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/2fa/status', authMiddleware, async (req, res) => {
  try {
    const user = await repository.findUserById(req.user.id);
    res.status(200).json({ enabled: Boolean(user?.twofa_enabled) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/2fa/setup', authMiddleware, doubleCsrfProtection, twofaManageLimiter, async (req, res) => {
  try {
    const { secret, qrDataUrl } = await twofa.startSetup(req.t, req.user.id);
    res.status(200).json({ secret, qrDataUrl });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/2fa/enable', authMiddleware, doubleCsrfProtection, twofaManageLimiter, async (req, res) => {
  try {
    await twofa.confirmSetup(req.t, req.user.id, req.body?.code);
    res.status(200).json({ enabled: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/2fa/disable', authMiddleware, doubleCsrfProtection, twofaManageLimiter, async (req, res) => {
  try {
    await twofa.disable(req.t, req.user.id, req.body?.password, req.body?.code);
    res.status(200).json({ enabled: false });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: req.t('auth.verifyLinkMissing') });
    }
    const user = await service.verifyEmail(req.t, token);
    res.status(200).json({ message: req.t('auth.emailVerified'), user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    await service.resendVerification(email);
    res.status(200).json({
      message: req.t('auth.resendVerificationSent')
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/logout', doubleCsrfProtection, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: req.t('auth.logoutFailed') });
    }
    res.clearCookie('sessionId');
    res.status(200).json({ message: req.t('auth.logoutSuccess') });
  });
});

router.get('/me', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    await service.forgotPassword(email);
    res.status(200).json({ message: req.t('auth.forgotPasswordSent') });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    await service.resetPassword(req.t, token, newPassword);
    res.status(200).json({ message: req.t('auth.passwordResetSuccess') });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/change-password', authMiddleware, doubleCsrfProtection, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    await service.changePassword(req.t, req.user.id, oldPassword, newPassword);

    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: req.t('auth.sessionEndError') });
      res.clearCookie('sessionId');
      res.status(200).json({ message: req.t('auth.passwordChangeSuccess') });
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


export default router;