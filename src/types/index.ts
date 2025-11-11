export interface TokenPayload {
  userId: string;
  phoneNumber: string;
  role: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface QueryFilters {
  [key: string]: any;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export enum CollaboratorRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer'
}

export enum WeddingStatus {
  PLANNING = 'planning',
  ONGOING = 'ongoing',
  COMPLETED = 'completed'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum RSVPStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined'
}

export enum BudgetStatus {
  ESTIMATED = 'estimated',
  APPROVED = 'approved',
  PAID = 'paid',
  PENDING = 'pending'
}

export enum VendorBookingStatus {
  INQUIRY = 'inquiry',
  NEGOTIATING = 'negotiating',
  BOOKED = 'booked',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled'
}