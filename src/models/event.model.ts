import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
    weddingId: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    eventType: 'ceremony' | 'reception' | 'mehendi' | 'sangeet' | 'haldi' | 'engagement' | 'cocktail' | 'other';
    startDateTime: Date;
    endDateTime: Date;
    dressCode?: string;
    status: 'planning' | 'confirmed' | 'completed' | 'cancelled';
    isPublic: boolean;
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
        required: [true, 'Start date and time is required'],
        index: true
    },
    endDateTime: {
        type: Date,
        required: [true, 'End date and time is required'],
        validate: {
            validator: function (this: IEvent, value: Date) {
                return value > this.startDateTime;
            },
            message: 'End date must be after start date'
        }
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


eventSchema.methods.isUpcoming = function (this: IEvent) {
    return this.startDateTime > new Date();
};


eventSchema.methods.isOngoing = function (this: IEvent) {
    const now = new Date();
    return this.startDateTime <= now && this.endDateTime >= now;
};


export const WeddingEvent = mongoose.model<IEvent>('Event', eventSchema);