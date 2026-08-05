const express = require('express');
const router = express.Router();

const studentRoutes = require('./student.routes');
const authRoutes = require('./auth.routes');

router.use('/students', studentRoutes);
router.use('/auth', authRoutes);

module.exports = router;