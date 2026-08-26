import mongoose, { Document, Schema } from 'mongoose';

export interface IBudgetInstallment {
  _id: mongoose.Types.ObjectId;
  label: string;
  amount: number;
  dueDate?: Date;
  status: 'pending' | 'paid';
  paidDate?: Date;
  notes?: string;
  createdAt: Date;
}

export interface IBudgetDocument {
  url: string;
  fileName: string;
  documentType: 'receipt' | 'invoice' | 'other';
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

export interface IBudget extends Document {
  weddingId: mongoose.Types.ObjectId;
  category: string;
  description: string;
  estimatedCost: number;
  actualCost?: number;
  vendor?: mongoose.Types.ObjectId;
  status: 'estimated' | 'approved' | 'paid' | 'pending';
  paymentDate?: Date;
  addedBy: mongoose.Types.ObjectId;
  currency: string;
  notes?: string;
  // Which function this expense is for, if any (e.g. "Sangeet DJ fee").
  // A wedding-wide line item like insurance or a planner's fee has none.
  eventId?: mongoose.Types.ObjectId;
  // Payment plan for this line item. When present, actualCost/amountPaid are
  // kept in sync from these by services/budget-installment.service.ts —
  // see recalculateBudgetActual.
  installments: IBudgetInstallment[];
  // Denormalized sum of installments[].amount where status === 'paid'.
  // Only meaningful once installments.length > 0.
  amountPaid?: number;
  receipts: IBudgetDocument[];
  createdAt: Date;
  updatedAt: Date;
}

const budgetInstallmentSchema = new Schema<IBudgetInstallment>({
  label: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount cannot be negative']
  },
  dueDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  paidDate: {
    type: Date
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const budgetDocumentSchema = new Schema<IBudgetDocument>({
  url: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  documentType: {
    type: String,
    enum: ['receipt', 'invoice', 'other'],
    default: 'receipt'
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const budgetSchema = new Schema<IBudget>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true
  },
  category: {
    type: String,
    enum: ['venue', 'catering', 'decoration', 'photography', 'music', 'invitations', 'logistics', 'others'],
    required: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  estimatedCost: {
    type: Number,
    required: [true, 'Estimated cost is required'],
    min: [0, 'Cost cannot be negative']
  },
  actualCost: {
    type: Number,
    min: [0, 'Cost cannot be negative']
  },
  vendor: {
    type: Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  status: {
    type: String,
    enum: ['estimated', 'approved', 'paid', 'pending'],
    default: 'estimated'
  },
  paymentDate: {
    type: Date
  },
  addedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  notes: {
    type: String
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  },
  installments: {
    type: [budgetInstallmentSchema],
    default: []
  },
  amountPaid: {
    type: Number,
    min: [0, 'Amount cannot be negative']
  },
  receipts: {
    type: [budgetDocumentSchema],
    default: []
  }
}, {
  timestamps: true
});

// Indexes
budgetSchema.index({ weddingId: 1 });
budgetSchema.index({ category: 1 });
budgetSchema.index({ status: 1 });
budgetSchema.index({ eventId: 1 });

export const Budget = mongoose.model<IBudget>('Budget', budgetSchema);
