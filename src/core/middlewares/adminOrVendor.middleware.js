import * as vendorRepo from '../../modules/vendor/vendor.repository.js';

// Allows admins, or users who own an ACTIVE vendor store.
const requireAdminOrVendor = async (req, res, next) => {
  try {
    if (req.user && req.user.role === 'admin') {
      return next();
    }

    const vendor = req.user ? await vendorRepo.findVendorByOwnerId(req.user.id) : null;

    if (vendor && vendor.status === 'active') {
      req.vendor = vendor;
      return next();
    }

    return res.status(403).json({
      success: false,
      message: req.t('common.adminOnly')
    });
  } catch (error) {
    next(error);
  }
};

export default requireAdminOrVendor;