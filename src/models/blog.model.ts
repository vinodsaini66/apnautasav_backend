import mongoose, { Document, Schema } from 'mongoose';

// The wedding-journal ("/blogs" on the frontend) content model. Public
// platform content, not scoped to any wedding — mirrors WeddingVendor's
// "public directory, admin-only write" shape (see CLAUDE.md).
//
// Keep this enum's values in sync with apnautasav_frontend/lib/blog-data.ts's
// `CategoryKey` union — the frontend owns the icon/color/label metadata for
// each tag (presentation-only), this is the source of truth for which tag
// values actually exist.
export enum BlogTag {
  Planning = 'planning',
  Guests = 'guests',
  Budget = 'budget',
  Vendors = 'vendors',
  Beauty = 'beauty',
  Sangeet = 'sangeet',
  Rituals = 'rituals',
  Honeymoon = 'honeymoon',
}

export interface IBlog extends Document {
  slug: string;
  tag: BlogTag;
  title: string;
  excerpt: string;
  body: string[];
  author: string;
  // Free-text display date (e.g. "Updated 18 Aug 2026" or "16 Aug 2026") —
  // kept as authored rather than a parsed Date, so the seeded copy renders
  // identically to the old static site.
  date: string;
  readTime: string;
  featured: boolean;
  // Stable manual ordering for the listing (ascending) — preserves the
  // curated order the static article array used to define, independent of
  // createdAt/updatedAt.
  order: number;
  isPublished: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blogSchema = new Schema<IBlog>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    tag: {
      type: String,
      enum: Object.values(BlogTag),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    excerpt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    body: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: 'body must have at least one paragraph',
      },
    },
    author: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
      trim: true,
    },
    readTime: {
      type: String,
      required: true,
      trim: true,
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isPublished: {
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

blogSchema.index({ tag: 1, isPublished: 1, order: 1 });
blogSchema.index({ title: 'text', excerpt: 'text' });

export const Blog = mongoose.model<IBlog>('Blog', blogSchema);
