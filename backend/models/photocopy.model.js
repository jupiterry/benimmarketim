import mongoose from "mongoose";

const photocopySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    fileType: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "completed"],
      default: "pending"
    },
    copies: {
      type: Number,
      default: 1,
      min: 1,
      max: 100
    },
    color: {
      type: String,
      enum: ["color", "black_white"],
      default: "black_white"
    },
    paperSize: {
      type: String,
      enum: ["A4", "A3", "A5", "Letter"],
      default: "A4"
    },
    notes: {
      type: String,
      maxlength: 500
    },
    adminNotes: {
      type: String,
      maxlength: 500
    },
    price: {
      type: Number,
      default: 0
    },
    isPaid: {
      type: Boolean,
      default: false
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloaded: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Index'ler
photocopySchema.index({ user: 1, createdAt: -1 });
photocopySchema.index({ status: 1 });
photocopySchema.index({ createdAt: -1 });

// Virtual field for file size in MB
photocopySchema.virtual('fileSizeMB').get(function() {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

// Virtual field for formatted file size
photocopySchema.virtual('formattedFileSize').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

export default mongoose.model("Photocopy", photocopySchema);
