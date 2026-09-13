import mongoose, { Document, Schema } from 'mongoose';

// Seating chart / table planner (optional — not every wedding uses assigned
// seating, so this is a wholly separate opt-in collection rather than a
// field bolted onto Guest/Wedding; a wedding that never creates a table
// simply never has any of these documents).
export interface ISeatingTable extends Document {
  weddingId: mongoose.Types.ObjectId;
  // Optional: many weddings only need assigned seating for one function
  // (usually the reception/sit-down meal), not every ceremony. Left unset,
  // a table applies wedding-wide.
  eventId?: mongoose.Types.ObjectId;
  name: string;
  capacity: number;
  // A guest sits at exactly one table at a time — enforced in the
  // controller (assigning pulls them off any other table first), not here.
  guestIds: mongoose.Types.ObjectId[];
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const seatingTableSchema = new Schema<ISeatingTable>({
  weddingId: {
    type: Schema.Types.ObjectId,
    ref: 'Wedding',
    required: true,
    index: true
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  },
  name: {
    type: String,
    required: [true, 'Table name is required'],
    trim: true,
    maxlength: [100, 'Table name cannot exceed 100 characters']
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: [1, 'Capacity must be at least 1'],
    max: [100, 'Capacity cannot exceed 100']
  },
  guestIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Guest',
    default: []
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [300, 'Notes cannot exceed 300 characters']
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

seatingTableSchema.index({ weddingId: 1, eventId: 1 });

export const SeatingTable = mongoose.model<ISeatingTable>('SeatingTable', seatingTableSchema);
