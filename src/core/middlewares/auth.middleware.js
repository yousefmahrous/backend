const authMiddleware = (req, res, next) => {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  return res.status(401).json({
    message: req.t('common.unauthorized')
  });
};

export default authMiddleware;