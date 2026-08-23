import express from 'express';
import { getUploadUrl } from '../../modules/upload/upload.controller.js';
import authMiddleware from '../../core/middlewares/auth.middleware.js';
import requireAdmin from '../../core/middlewares/admin.middleware.js';

const router = express.Router();

router.get('/', authMiddleware, requireAdmin, getUploadUrl);

export default router;