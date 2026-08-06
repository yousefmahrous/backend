const express = require('express');
const router = express.Router();

const studentRoutes = require('./student.routes');
const authRoutes = require('./auth.routes');
const uploadRoutes = require('./upload.routes');

router.use('/students', studentRoutes);
router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);

module.exports = router;