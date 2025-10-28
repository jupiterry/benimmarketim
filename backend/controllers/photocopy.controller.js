import fs from "fs";
import path from "path";
import PhotocopyFile from "../models/photocopyFile.model.js";

const uploadsDir = path.join(process.cwd(), "uploads", "photocopy");
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

export const uploadFile = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ success: false, message: "Dosya gerekli" });
		}

		const { copies = 1, color = "black_white", paperSize = "A4", notes = "" } = req.body;

		const fileDoc = await PhotocopyFile.create({
			user: req.user._id,
			originalName: req.file.originalname,
			filePath: req.file.path,
			mimeType: req.file.mimetype,
			fileSize: req.file.size,
			copies,
			color,
			paperSize,
			notes,
		});

		res.status(201).json({ success: true, data: fileDoc });
	} catch (error) {
		console.error("uploadFile error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};

export const getMyFiles = async (req, res) => {
	try {
		const files = await PhotocopyFile.find({ user: req.user._id }).sort({ createdAt: -1 });
		res.json({ success: true, data: files });
	} catch (error) {
		console.error("getMyFiles error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};

export const downloadFile = async (req, res) => {
	try {
		const file = await PhotocopyFile.findById(req.params.id);
		if (!file) return res.status(404).json({ success: false, message: "Dosya bulunamadı" });

		return res.download(file.filePath, file.originalName);
	} catch (error) {
		console.error("downloadFile error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};

export const deleteFile = async (req, res) => {
	try {
		const file = await PhotocopyFile.findOne({ _id: req.params.id });
		if (!file) return res.status(404).json({ success: false, message: "Dosya bulunamadı" });

		try { fs.unlinkSync(file.filePath); } catch {}
		await file.deleteOne();
		res.json({ success: true, message: "Silindi" });
	} catch (error) {
		console.error("deleteFile error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};

// Admin
export const adminListAll = async (req, res) => {
	try {
		const { status, user, dateFrom, dateTo } = req.query;
		const query = {};
		if (status) query.status = status;
		if (user) query.user = user;
		if (dateFrom || dateTo) {
			query.createdAt = {};
			if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
			if (dateTo) {
				const end = new Date(dateTo);
				end.setHours(23,59,59,999);
				query.createdAt.$lte = end;
			}
		}
		const files = await PhotocopyFile.find(query).populate("user", "name email").sort({ createdAt: -1 });
		res.json({ success: true, data: files });
	} catch (error) {
		console.error("adminListAll error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};

export const adminStats = async (req, res) => {
	try {
		const totalFiles = await PhotocopyFile.countDocuments();
		const pendingFiles = await PhotocopyFile.countDocuments({ status: "pending" });
		const completedFiles = await PhotocopyFile.countDocuments({ status: "completed" });
		const startOfDay = new Date();
		startOfDay.setHours(0,0,0,0);
		const todayFiles = await PhotocopyFile.countDocuments({ createdAt: { $gte: startOfDay } });
		res.json({ success: true, data: { totalFiles, pendingFiles, completedFiles, todayFiles } });
	} catch (error) {
		console.error("adminStats error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};

export const adminUpdate = async (req, res) => {
	try {
		const { id } = req.params;
		const update = req.body;
		const file = await PhotocopyFile.findByIdAndUpdate(id, update, { new: true });
		if (!file) return res.status(404).json({ success: false, message: "Dosya bulunamadı" });
		res.json({ success: true, data: file });
	} catch (error) {
		console.error("adminUpdate error", error);
		res.status(500).json({ success: false, message: "Sunucu hatası" });
	}
};


