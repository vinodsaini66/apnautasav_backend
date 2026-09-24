import multer from 'multer';
import os from 'os';

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

const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Vendor contracts/invoices: PDFs, Word docs, or scanned image pages.
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      callback(new Error('Only PDF, DOC, DOCX, JPG or PNG files are allowed'));
      return;
    }
    callback(null, true);
  },
});

// Vendor OS portfolio videos (spec 4.3: direct upload up to 200 MB). Too big
// to buffer in memory like the image uploads above, so these go to a temp
// file and are streamed to S3 (config/s3.ts#uploadFileToS3), then deleted.
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;

export const videoUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      callback(new Error('Only MP4, MOV or WEBM videos are allowed'));
      return;
    }
    callback(null, true);
  },
});
