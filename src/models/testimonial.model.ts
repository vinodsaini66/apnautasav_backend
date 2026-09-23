import mongoose, { Document, Schema } from 'mongoose';

// Public platform content for the landing page's "What our couples say"
// section — not scoped to any wedding, mirrors Faq's "public content,
// admin-curated" shape (see faq.model.ts). Kept as a real, backend-served
// collection rather than hardcoded frontend copy: per-couple `quote`/
// `highlight` text is seeded placeholder content (see scripts/seed.ts's
// seedTestimonials, until real user-submitted testimonials replace them),
// but every row is tied to a REAL `userId` and a real wedding's real
// location/guest/function data where available — only the review prose
// itself is fabricated, not the person or their numbers.
export interface ITestimonial extends Document {
  userId?: mongoose.Types.ObjectId;
  weddingId?: mongoose.Types.ObjectId;
  name: string;
  location?: string;
  // Freeform display label, e.g. "Bengaluru · November 2026" — not a real Date
  // field since the landing page only ever shows city + month/year prose.
  dateLabel?: string;
  initials: string;
  avatarUrl?: string;
  quote: string;
  // Optional one-line highlight fact, e.g. "Planned 4 functions, 310 guests"
  // — real when derived from the linked wedding at seed time.
  highlight?: string;
  rating: number;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const testimonialSchema = new Schema<ITestimonial>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    weddingId: {
      type: Schema.Types.ObjectId,
      ref: 'Wedding',
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    dateLabel: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    initials: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    quote: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    highlight: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
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
  },
  {
    timestamps: true,
  }
);

testimonialSchema.index({ isActive: 1, order: 1 });

export const Testimonial = mongoose.model<ITestimonial>('Testimonial', testimonialSchema);
