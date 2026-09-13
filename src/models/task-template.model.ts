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
}

export interface ITaskTemplate extends Document {
  name: string;
  description?: string;
  // Owner of a custom (non-system) template. Deliberately scoped to a
  // USER, not a single wedding — a family reuses their own template across
  // however many weddings they create, and this is the same shape a
  // wedding-planner Organization account will reuse later once Track C
  // (multi-tenant planner accounts, see B2B_WhiteLabel_Planner_Plan.md)
  // ships: whoever creates a template owns it, and it follows them across
  // every wedding they work on — not locked to one. No separate
  // "org-scoped" template type is needed today; when Organization accounts
  // exist, an org's templates are simply the templates its owner/staff
  // user already created.
  createdBy?: mongoose.Types.ObjectId;
  // System/preset templates (seeded — see scripts/seed.ts) are visible to
  // every user and read-only via the API (no createdBy, can't be
  // edited/deleted through TaskTemplateController). `key` is only set on
  // these, for idempotent re-seeding.
  isSystemTemplate: boolean;
  key?: string;
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
    isSystemTemplate: {
      type: Boolean,
      default: false
    },
    key: {
      type: String,
      unique: true,
      sparse: true
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
taskTemplateSchema.index({ isSystemTemplate: 1 });

export const TaskTemplate = mongoose.model<ITaskTemplate>('TaskTemplate', taskTemplateSchema);
