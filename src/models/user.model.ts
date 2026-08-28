import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  phoneNumber?: string;
  fullName: string;
  email: string;
  fcm_token?: string;
  otp?: string;
  otpExpiry?: Date;
  isVerified: boolean;
  role: 'user' | 'admin';
  preferences: {
    language: string;
    theme: string;
  };
  avatarUrl?: string;
  notificationSettings: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    taskReminders: boolean;
    rsvpUpdates: boolean;
    vendorMessages: boolean;
    budgetAlerts: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  phoneNumber: {
    type: String,
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  fcm_token:{type: String},
  email: {
    type: String,
    trim: true,
    lowercase: true,
    required: [true, 'Email is required'],
    unique: true,
  },
  otp: {
    type: String,
    select: false
  },
  otpExpiry: {
    type: Date,
    select: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    theme: {
      type: String,
      default: 'light'
    }
  },
  avatarUrl: {
    type: String
  },
  notificationSettings: {
    pushEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    taskReminders: { type: Boolean, default: true },
    rsvpUpdates: { type: Boolean, default: true },
    vendorMessages: { type: Boolean, default: true },
    budgetAlerts: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

// Indexes

userSchema.index({ email: 1 });

export const User = mongoose.model<IUser>('User', userSchema);