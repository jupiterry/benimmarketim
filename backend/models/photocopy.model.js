import mongoose from "mongoose";

const photocopySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  copies: {
    type: Number,
    default: 1,
    min: 1,
    max: 100
  },
  color: {
    type: String,
    enum: ['black_white', 'color'],
    default: 'black_white'
  },
  paperSize: {
    type: String,
    enum: ['A4', 'A3', 'A5', 'Letter'],
    default: 'A4'
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'completed', 'cancelled'],
    default: 'pending'
  },
  price: {
    type: Number,
    default: 0
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  adminNotes: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
photocopySchema.index({ user: 1, status: 1 });
photocopySchema.index({ status: 1 });
photocopySchema.index({ uploadedAt: -1 });

export default mongoose.model('Photocopy', photocopySchema);
