import express from 'express';
import { getUploadUrl } from '../../modules/upload/upload.controller.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdminOrVendor from '../../core/middlewares/adminOrVendor.middleware.js';

const router = express.Router();

router.get('/', authMiddleware, requireAdminOrVendor, getUploadUrl);

export default router;