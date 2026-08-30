import express from 'express';
import { generateToken } from '../../core/config/csrf.config.js';

const router = express.Router();

router.get('/', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.status(200).json({ csrfToken });
});

export default router;