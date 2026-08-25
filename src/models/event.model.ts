import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
    weddingId: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    eventType: 'ceremony' | 'reception' | 'mehendi' | 'sangeet' | 'haldi' | 'engagement' | 'cocktail' | 'other';
    // Optional: a couple often knows they're doing a Sangeet before they've
    // picked a date or venue. Undated events show as "Date TBD" in the UI,
    // sort last, and are excluded from upcoming/timeline queries.
    startDateTime?: Date;
    endDateTime?: Date;
    location?: {
        venueName?: string;
        address?: string;
        mapUrl?: string;
    };
    dressCode?: string;
    status: 'planning' | 'confirmed' | 'completed' | 'cancelled';
    isPublic: boolean;
    // Planning target for this function, compared against the live sum of
    // Budget items tagged with this event's id (never stored — always
    // computed, so the two numbers can't drift apart).
    estimatedBudget?: number;
    reminders: {
        enabled: boolean;
        reminderTime: Date;
        sent: boolean;
    }[];
    imageUrl?: string;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const eventSchema = new Schema<IEvent>({
    weddingId: {
        type: Schema.Types.ObjectId,
        ref: 'Wedding',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: [true, 'Event title is required'],
        trim: true,
        minlength: [3, 'Title must be at least 3 characters long'],
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    eventType: {
        type: String,
        enum: {
            values: ['ceremony', 'reception', 'mehendi', 'sangeet', 'haldi', 'engagement', 'cocktail', 'other'],
            message: '{VALUE} is not a valid event type'
        },
        required: [true, 'Event type is required'],
        index: true
    },
    startDateTime: {
        type: Date,
        index: true
    },
    endDateTime: {
        type: Date,
        validate: {
            validator: function (this: IEvent, value: Date) {
                // Only meaningful to compare once both ends of the range
                // are actually set — an event can have just one, or
                // neither, while its date is still undecided.
                if (!value || !this.startDateTime) return true;
                return value > this.startDateTime;
            },
            message: 'End date must be after start date'
        }
    },
    location: {
        venueName: { type: String, trim: true, maxlength: 200 },
        address: { type: String, trim: true, maxlength: 500 },
        mapUrl: { type: String, trim: true }
    },
    dressCode: {
        type: String,
        trim: true,
        maxlength: [100, 'Dress code cannot exceed 100 characters']
    },
    status: {
        type: String,
        enum: ['planning', 'confirmed', 'completed', 'cancelled'],
        default: 'planning',
        index: true
    },
    isPublic: {
        type: Boolean,
        default: true
    },
    estimatedBudget: {
        type: Number,
        min: [0, 'Budget cannot be negative']
    },
    reminders: [{
        enabled: {
            type: Boolean,
            default: true
        },
        reminderTime: {
            type: Date,
            required: true
        },
        sent: {
            type: Boolean,
            default: false
        }
    }],

    imageUrl: {
        type: String,
        trim: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes for better query performance
eventSchema.index({ weddingId: 1, startDateTime: 1 });
eventSchema.index({ weddingId: 1, eventType: 1 });
eventSchema.index({ weddingId: 1, status: 1 });
eventSchema.index({ startDateTime: 1, endDateTime: 1 });

// Virtual for duration in hours
eventSchema.virtual('durationHours').get(function (this: IEvent) {
    if (this.startDateTime && this.endDateTime) {
        return (this.endDateTime.getTime() - this.startDateTime.getTime()) / (1000 * 60 * 60);
    }
    return 0;
});

// These don't store a back-reference on Event at all — Guest/Vendor/Task
// each own the relationship (Guest.eventIds, Vendor.eventIds, Task.eventId),
// so there's exactly one place the link can drift, not two. Virtual populate
// lets the Event side still ask "who's invited to me?" without duplicating
// the array. Works with .populate(...) whether or not the query is .lean().
eventSchema.virtual('guests', { ref: 'Guest', localField: '_id', foreignField: 'eventIds' });
eventSchema.virtual('vendors', { ref: 'Vendor', localField: '_id', foreignField: 'eventIds' });
eventSchema.virtual('tasks', { ref: 'Task', localField: '_id', foreignField: 'eventId' });
eventSchema.virtual('budgetItems', { ref: 'Budget', localField: '_id', foreignField: 'eventId' });

eventSchema.methods.isUpcoming = function (this: IEvent) {
    return !!this.startDateTime && this.startDateTime > new Date();
};


eventSchema.methods.isOngoing = function (this: IEvent) {
    if (!this.startDateTime || !this.endDateTime) return false;
    const now = new Date();
    return this.startDateTime <= now && this.endDateTime >= now;
};


export const WeddingEvent = mongoose.model<IEvent>('Event', eventSchema);
