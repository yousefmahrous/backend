const express = require('express');
const router = express.Router();
const { getUploadUrl } = require('../../modules/upload/upload.controller');

router.get('/', getUploadUrl);

module.exports = router;