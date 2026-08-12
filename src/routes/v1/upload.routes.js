import express from 'express';
import { getUploadUrl } from '../../modules/upload/upload.controller.js';

const router = express.Router();

router.get('/', getUploadUrl);

export default router;
