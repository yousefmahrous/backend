const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleware = (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ message: 'غير مصرح لك بالدخول، برجاء تسجيل الدخول أولاً' });
    }

    const decodedPayload = jwt.verify(token, JWT_SECRET);

    req.user = decodedPayload;

    next();

  } catch (error) {
    return res.status(401).json({ message: 'الجلسة انتهت أو غير صالحة، برجاء إعادة تسجيل الدخول' });
  }
};

module.exports = authMiddleware;