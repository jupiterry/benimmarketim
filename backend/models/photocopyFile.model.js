import mongoose from "mongoose";

const PhotocopyFileSchema = new mongoose.Schema(
	{
		user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		originalName: { type: String, required: true },
		filePath: { type: String, required: true },
		mimeType: { type: String, required: true },
		fileSize: { type: Number, required: true },
		copies: { type: Number, default: 1, min: 1 },
		color: { type: String, enum: ["black_white", "color"], default: "black_white" },
		paperSize: { type: String, default: "A4" },
		notes: { type: String },
		adminNotes: { type: String },
		status: { type: String, enum: ["pending", "processing", "ready", "completed"], default: "pending" },
		isPaid: { type: Boolean, default: false },
		price: { type: Number, default: 0 },
	},
	{ timestamps: true }
);

PhotocopyFileSchema.index({ createdAt: -1 });

const PhotocopyFile = mongoose.model("PhotocopyFile", PhotocopyFileSchema);
export default PhotocopyFile;


