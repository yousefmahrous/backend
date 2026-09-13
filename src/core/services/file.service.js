import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Client from '../config/s3.config.js';
import crypto from 'crypto';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const generatePresignedUploadUrl = async (t, originalFileName, contentType) => {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    const err = new Error(t('upload.invalidFileType'));
    err.code = 'INVALID_FILE_TYPE';
    throw err;
  }

  const fileExtension = originalFileName.split('.').pop();
  const uniqueFileName = `${crypto.randomUUID()}-${Date.now()}.${fileExtension}`;
  const bucketName = process.env.B2_BUCKET_NAME;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: uniqueFileName,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return {
    uploadUrl: presignedUrl,
    fileKey: uniqueFileName,
    finalUrl: `https://${bucketName}.s3.eu-central-003.backblazeb2.com/${uniqueFileName}`
  };
};