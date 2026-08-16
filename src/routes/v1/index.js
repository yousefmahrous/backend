import express from 'express';
import bookRoutes from './book.routes.js';
import authRoutes from './auth.routes.js';
import uploadRoutes from './upload.routes.js';
import cartRoutes from './cart.routes.js';
import favoriteRoutes from './favorite.routes.js';

const router = express.Router();

router.use('/books', bookRoutes);
router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);
router.use('/cart', cartRoutes);
router.use('/favorites', favoriteRoutes);

export default router;