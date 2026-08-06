const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3.config');
const crypto = require('crypto');

/**
 * @param {string} originalFileName
 * @param {string} contentType
 */
const generatePresignedUploadUrl = async (originalFileName, contentType) => {
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

module.exports = {
  generatePresignedUploadUrl
};