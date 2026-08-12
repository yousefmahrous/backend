import { generatePresignedUploadUrl } from '../../core/services/file.service.js';

export const getUploadUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.query;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'يجب إرسال fileName و fileType' });
    }

    const result = await generatePresignedUploadUrl(fileName, fileType);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء توليد رابط الرفع' });
  }
};
