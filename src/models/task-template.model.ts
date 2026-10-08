import mongoose, { Document, Schema } from 'mongoose';

// Checklist/task templates (gap #23, deliberately deferred in Phase 6) —
// a reusable set of tasks that can be applied to any wedding in one action
// instead of adding each one by hand.
export interface ITaskTemplateItem {
  title: string;
  description?: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  // Days relative to the wedding's own date this item's due date should
  // land on when applied — negative = before the wedding (the overwhelming
  // majority: "book venue" 90 days out), positive = after (rare: "send
  // thank-you cards" +7 days).
  dueOffsetDays: number;
  // Optional: when applied, auto-tag the created task to whichever Event
  // of this type already exists on the target wedding (e.g. 'mehendi') —
  // silently left untagged (the task is still created) if no such event
  // exists yet on that wedding.
  eventType?: string;
  // Track C (agency templates): who the created task goes to on a client
  // wedding — the wedding's lead planner, or everyone on its planning team
  // with that agency role. Ignored on family weddings.
  assigneeRole?: 'lead' | 'manager' | 'coordinator';
  // Track C: create the task as "Team only" (never shown to the family).
  isInternal?: boolean;
}

export interface ITaskTemplate extends Document {
  name: string;
  description?: string;
  // Who made a custom (non-system) template. A personal template follows
  // its creator across every wedding they work on.
  createdBy?: mongoose.Types.ObjectId;
  // Track C: set for an agency's shared template — usable by its staff
  // (templates.apply) on the agency's client weddings, edited by staff with
  // templates.manage. Unset = a personal or system template, as before.
  organizationId?: mongoose.Types.ObjectId | null;
  // System/preset templates (seeded — see scripts/seed.ts) are visible to
  // every user and read-only via the API (no createdBy, can't be
  // edited/deleted through TaskTemplateController). `key` is only set on
  // these, for idempotent re-seeding.
  isSystemTemplate: boolean;
  key?: string;
  /** System templates only: position in the template picker, smallest first. */
  sortOrder?: number;
  items: ITaskTemplateItem[];
  createdAt: Date;
  updatedAt: Date;
}

const taskTemplateItemSchema = new Schema<ITaskTemplateItem>(
  {
    title: {
      type: String,
      required: [true, 'Item title is required'],
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    category: {
      type: String,
      enum: ['venue', 'decoration', 'catering', 'logistics', 'invitations', 'music', 'photography', 'others'],
      required: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    dueOffsetDays: {
      type: Number,
      required: true
    },
    eventType: {
      type: String,
      enum: ['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'other']
    },
    assigneeRole: {
      type: String,
      enum: ['lead', 'manager', 'coordinator']
    },
    isInternal: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const taskTemplateSchema = new Schema<ITaskTemplate>(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: 150
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      default: undefined
    },
    isSystemTemplate: {
      type: Boolean,
      default: false
    },
    key: {
      type: String,
      unique: true,
      sparse: true
    },
    sortOrder: {
      type: Number
    },
    items: {
      type: [taskTemplateItemSchema],
      validate: {
        validator: (items: ITaskTemplateItem[]) => Array.isArray(items) && items.length > 0,
        message: 'A template needs at least one checklist item'
      }
    }
  },
  { timestamps: true }
);

taskTemplateSchema.index({ createdBy: 1 });
taskTemplateSchema.index({ organizationId: 1 }, { sparse: true });
taskTemplateSchema.index({ isSystemTemplate: 1 });

export const TaskTemplate = mongoose.model<ITaskTemplate>('TaskTemplate', taskTemplateSchema);
