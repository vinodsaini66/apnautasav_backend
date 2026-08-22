import multer from 'multer';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Memory storage: the file buffer goes straight to S3 (config/s3.ts), never
// touching disk on this server.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new Error('Only JPEG, PNG, WEBP or GIF images are allowed'));
      return;
    }
    callback(null, true);
  },
});
