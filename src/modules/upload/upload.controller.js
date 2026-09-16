import { generatePresignedUploadUrl } from '../../core/services/file.service.js';
import logger from '../../core/logger.js';

export const getUploadUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.query;

    if (!fileName || !fileType) {
      return res.status(400).json({ success: false, message: req.t('upload.missingFields') });
    }

    const result = await generatePresignedUploadUrl(req.t, fileName, fileType);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ err: error }, 'Upload URL generation failed');
    if (error.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: req.t('upload.generateUrlError') });
  }
};