import express from 'express';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import * as service from '../../modules/auth/auth.service.js';
import { signupSchema, loginSchema } from '../../modules/auth/auth.schema.js';
import { loginLimiter, signupLimiter, forgotPasswordLimiter } from '../../core/middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const validatedData = signupSchema.parse(req.body);
    const newUser = await service.signup(validatedData);
    res.status(201).json({ message: 'تم إنشاء الحساب بنجاح', user: newUser });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(400).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const user = await service.login(validatedData);

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح',
      user: req.session.user
    });

  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(400).json({ message: error.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'فشل تسجيل الخروج' });
    }
    res.clearCookie('sessionId');
    res.status(200).json({ message: 'تم تسجيل الخروج بنجاح' });
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
    res.status(200).json({ message: 'إذا كان البريد مسجلاً لدينا، ستصلك رسالة تحتوي على رابط التعيين.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    await service.resetPassword(token, newPassword);
    res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    await service.changePassword(req.user.id, oldPassword, newPassword);

    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: 'حدث خطأ أثناء إنهاء الجلسة' });
      res.clearCookie('sessionId');
      res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح، يرجى إعادة تسجيل الدخول.' });
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
