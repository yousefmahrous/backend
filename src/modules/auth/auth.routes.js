const authMiddleware = require('../../core/middlewares/auth.middleware');
const express = require('express');
const router = express.Router();
const service = require('./auth.service'); 
const { signupSchema, loginSchema } = require('./auth.schema'); 

router.post('/signup', async (req, res) => {
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
    const result = await service.login(validatedData);

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000
    });

    res.status(200).json({ message: 'تم تسجيل الدخول بنجاح', user: result.user });
    
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(400).json({ message: error.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token'); 
  res.status(200).json({ message: 'تم تسجيل الخروج بنجاح' });
});

router.get('/users/me', authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

module.exports = router;