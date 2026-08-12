const authMiddleware = (req, res, next) => {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  return res.status(401).json({
    message: 'غير مصرح لك بالدخول، برجاء تسجيل الدخول أولاً'
  });
};

export default authMiddleware;
