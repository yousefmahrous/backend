import express from 'express';
import bookRoutes from './book.routes.js';
import authRoutes from './auth.routes.js';
import uploadRoutes from './upload.routes.js';
import cartRoutes from './cart.routes.js';
import favoriteRoutes from './favorite.routes.js';
import contactRoutes from './contact.routes.js';
import reviewRoutes from './review.routes.js';
import paymentRoutes from './payment.routes.js';
import orderRoutes from './order.routes.js';
import refundRoutes from './refund.routes.js';


const router = express.Router();

router.use('/books', bookRoutes);
router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);
router.use('/cart', cartRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/contact', contactRoutes);
router.use('/reviews', reviewRoutes);
router.use('/payment', paymentRoutes);
router.use('/orders', orderRoutes);
router.use('/refunds', refundRoutes);

export default router;