const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح لك بالقيام بهذا الإجراء، هذه الصلاحية للأدمن فقط'
    });
  }
};

export default requireAdmin;
