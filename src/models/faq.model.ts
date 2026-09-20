import mongoose, { Document, Schema } from 'mongoose';

// Public platform content for the landing page's FAQ accordion — not scoped
// to any wedding, mirrors Blog's "public content, admin-only write" shape
// (see CLAUDE.md / blog.model.ts).
export interface IFaq extends Document {
  question: string;
  answer: string;
  // Stable manual ordering for the accordion (ascending) — independent of
  // createdAt/updatedAt, same convention as Blog.order.
  order: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const faqSchema = new Schema<IFaq>(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

faqSchema.index({ isActive: 1, order: 1 });

export const Faq = mongoose.model<IFaq>('Faq', faqSchema);
