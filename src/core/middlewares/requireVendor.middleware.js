import * as vendorRepo from '../../modules/vendor/vendor.repository.js';

const requireVendor = async (req, res, next) => {
  const vendor = await vendorRepo.findVendorByOwnerId(req.user.id);

  if (!vendor || vendor.status !== 'active') {
    return res.status(403).json({ success: false, message: req.t('vendor.notActive') });
  }

  req.vendor = vendor;
  next();
};

export default requireVendor;