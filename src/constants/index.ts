export const CONSTANTS = {
  WEDDING_CODE_LENGTH: 6,
  OTP_LENGTH: 6,
  OTP_EXPIRY_MINUTES: 10,
  
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword'],
  
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },
  
  CATEGORIES: {
    GUEST: ['family', 'friends', 'colleagues', 'others'],
    TASK: ['decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others'],
    BUDGET: ['venue', 'catering', 'decoration', 'photography', 'music', 'invitations', 'logistics', 'other'],
    VENDOR: ['catering', 'photography', 'decoration', 'music', 'venue', 'invitations', 'logistics', 'other']
  },
  
  CURRENCIES: ['INR', 'USD', 'EUR', 'GBP'],
  
  NOTIFICATION_TYPES: [
    'task_assigned',
    'comment_added',
    'member_invited',
    'budget_updated',
    'activity_alert'
  ],
  
  ACTIVITY_ACTIONS: [
    'created',
    'updated',
    'deleted',
    'commented',
    'assigned',
    'member_joined'
  ],
  
  ENTITY_TYPES: [
    'guest',
    'task',
    'budget',
    'vendor',
    'collaborator',
    'note'
  ]
};

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden access',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  INTERNAL_ERROR: 'Internal server error',
  INVALID_TOKEN: 'Invalid or expired token',
  INVALID_OTP: 'Invalid or expired OTP',
  PHONE_EXISTS: 'Phone number already registered',
  EMAIL_EXISTS: 'Email already registered',
  WEDDING_NOT_FOUND: 'Wedding not found',
  GUEST_NOT_FOUND: 'Guest not found',
  TASK_NOT_FOUND: 'Task not found',
  BUDGET_NOT_FOUND: 'Budget item not found',
  VENDOR_NOT_FOUND: 'Vendor not found',
  NO_PERMISSION: 'You do not have permission to perform this action'
};