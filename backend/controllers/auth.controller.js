import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Feedback from "../models/feedback.model.js";
import jwt from "jsonwebtoken";
import { sendToN8N } from "../services/n8n.service.js";

const generateTokens = (userId) => {
	// Access token artık çok uzun süreli (1 yıl) - kullanıcı kendisi çıkış yapana kadar geçerli
	const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "365d", // 1 yıl
	});

	const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: "365d", // 1 yıl
	});

	return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
	await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 365 * 24 * 60 * 60); // 365 days (1 yıl)
};

const setCookies = (res, accessToken, refreshToken) => {
	res.cookie("accessToken", accessToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
		maxAge: 365 * 24 * 60 * 60 * 1000, // 1 yıl - kullanıcı kendisi çıkış yapana kadar geçerli
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
		maxAge: 365 * 24 * 60 * 60 * 1000, // 1 yıl
	});
};

export const signup = async (req, res) => {
	const { email, password, name, phone, deviceType } = req.body;
	try {
		console.log("Kayıt isteği alındı:", { email, name, phone, deviceType }); // Debug log
		const userExists = await User.findOne({ email });

		if (userExists) {
			return res.status(400).json({ message: "Kullanıcı zaten mevcut" });
		}
		
		// Map deviceType to valid enum values
		let mappedDeviceType = deviceType ? deviceType.toLowerCase() : 'unknown';
		
		// Map common device types to enum values
		if (mappedDeviceType === 'android' || mappedDeviceType === 'ios') {
			mappedDeviceType = 'mobile';
		} else if (mappedDeviceType === 'web') {
			mappedDeviceType = 'desktop';
		}
		
		// Validate against enum
		const validDeviceTypes = ['desktop', 'mobile', 'tablet', 'unknown'];
		if (!validDeviceTypes.includes(mappedDeviceType)) {
			mappedDeviceType = 'unknown';
		}
		
		const user = await User.create({ name, email, password, phone, deviceType: mappedDeviceType });
		console.log("Oluşturulan kullanıcı:", user); // Debug log

		// authenticate
		const { accessToken, refreshToken } = generateTokens(user._id);
		await storeRefreshToken(user._id, refreshToken);

		setCookies(res, accessToken, refreshToken);

		// n8n'e kullanıcı kaydı webhook'u gönder (asenkron, hata olsa bile ana işlemi engellemez)
		try {
			await sendToN8N('user.registered', {
				userId: user._id.toString(),
				name: user.name,
				email: user.email,
				phone: user.phone || '',
				role: user.role,
				deviceType: user.deviceType || '',
				createdAt: user.createdAt,
				registeredAt: new Date().toISOString()
			});
		} catch (n8nError) {
			// n8n webhook hatası ana işlemi engellemez
			console.error('n8n webhook gönderilirken hata:', n8nError.message);
		}

		res.status(201).json({
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role,
			phone: user.phone,
			accessToken: accessToken, // Flutter için token'ı response'da gönder
			refreshToken: refreshToken // Flutter için refresh token'ı da gönder
		});
	} catch (error) {
		console.log("Error in signup controller", error.message);
		res.status(500).json({ message: error.message });
	}
};

export const login = async (req, res) => {
	try {
		const { email, password, deviceType } = req.body;
		console.log("Login request:", { email, deviceType }); // Debug log
		
		const user = await User.findOne({ email });

		if (!user) {
			console.log("Login failed: User not found for email:", email);
			return res.status(400).json({ message: "Geçersiz E-posta veya Şifre" });
		}

		const isPasswordValid = await user.comparePassword(password);
		if (!isPasswordValid) {
			console.log("Login failed: Invalid password for email:", email);
			return res.status(400).json({ message: "Geçersiz E-posta veya Şifre" });
		}

		if (user && isPasswordValid) {
			// Update device type if provided
			// Map deviceType to valid enum values
			if (deviceType) {
				let mappedDeviceType = deviceType.toLowerCase();
				
				// Map common device types to enum values
				if (mappedDeviceType === 'android' || mappedDeviceType === 'ios') {
					mappedDeviceType = 'mobile';
				} else if (mappedDeviceType === 'web') {
					mappedDeviceType = 'desktop';
				}
				
				// Validate against enum
				const validDeviceTypes = ['desktop', 'mobile', 'tablet', 'unknown'];
				if (!validDeviceTypes.includes(mappedDeviceType)) {
					mappedDeviceType = 'unknown';
				}
				
				user.lastDeviceType = user.deviceType;
				user.deviceType = mappedDeviceType;
				await user.save();
			}
			
			const { accessToken, refreshToken } = generateTokens(user._id);
			await storeRefreshToken(user._id, refreshToken);
			setCookies(res, accessToken, refreshToken);

			console.log("✅ Login successful:", {
				userId: user._id,
				email: user.email,
				role: user.role,
				deviceType: user.deviceType,
				tokensGenerated: true
			});

			res.json({
				_id: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
				phone: user.phone,
				accessToken: accessToken, // Flutter için token'ı response'da gönder
				refreshToken: refreshToken // Flutter için refresh token'ı da gönder
			});
		} else {
			console.log("Login failed: Invalid email or password for:", email);
			res.status(400).json({ message: "Geçersiz E-posta veya Şifre" });
		}
	} catch (error) {
		console.error("Error in login controller:", error.message);
		console.error("Error stack:", error.stack);
		
		// Mongoose validation error handling
		if (error.name === 'ValidationError') {
			const errors = Object.values(error.errors).map(err => err.message);
			return res.status(400).json({ 
				message: "Validation error", 
				errors: errors 
			});
		}
		
		res.status(500).json({ 
			message: "Sunucu hatası", 
			error: error.message 
		});
	}
};

export const logout = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;
		if (refreshToken) {
			const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
			await redis.del(`refresh_token:${decoded.userId}`);
		}

		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");
		res.json({ message: "Başarıyla çıkış yapıldı." });
	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// this will refresh the access token
export const refreshToken = async (req, res) => {
	try {
		// Flutter'dan gelen refresh token'ı body'den al
		const { refreshToken } = req.body;
		
		if (!refreshToken) {
			return res.status(401).json({ message: "No refresh token provided" });
		}

		console.log("Refresh token request received"); // Debug log

		const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
		const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

		if (storedToken !== refreshToken) {
			return res.status(401).json({ message: "Invalid refresh token" });
		}

		const accessToken = jwt.sign({ userId: decoded.userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "365d" }); // 1 yıl

		// Cookie'yi de güncelle
		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 365 * 24 * 60 * 60 * 1000, // 1 yıl
		});

		console.log("Token refreshed successfully"); // Debug log

		// Flutter için yeni access token'ı response'da gönder
		res.json({ 
			message: "Token refreshed successfully",
			accessToken: accessToken
		});
	} catch (error) {
		console.log("Error in refreshToken controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getProfile = async (req, res) => {
	try {
		res.json(req.user);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Test endpoint'leri
export const testApi = async (req, res) => {
	res.json({ message: "API çalışıyor", timestamp: new Date().toISOString() });
};

export const testAuth = async (req, res) => {
	res.json({ 
		message: "Auth çalışıyor", 
		user: req.user,
		timestamp: new Date().toISOString()
	});
};

// Kullanıcı kendi hesabını silme
export const deleteMyAccount = async (req, res) => {
	try {
		// Güvenlik: Sadece authenticated kullanıcının kendi ID'sini kullan
		// Body'den veya params'tan gelen userId parametreleri yok sayılır
		const userId = req.user._id || req.user.id;
		
		if (!userId) {
			return res.status(401).json({ message: "Kullanıcı kimliği bulunamadı" });
		}

		// Kullanıcının siparişlerini sil
		await Order.deleteMany({ user: userId });
		
		// Kullanıcının geri bildirimlerini sil
		await Feedback.deleteMany({ user: userId });
		
		// Redis'teki refresh token'ı sil
		await redis.del(`refresh_token:${userId}`);
		
		// Kullanıcıyı sil
		await User.findByIdAndDelete(userId);

		// Cookie'leri temizle
		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");

		console.log(`Kullanıcı hesabı silindi - ID: ${userId}`);

		res.json({ 
			message: "Hesabınız başarıyla silindi",
			deletedAt: new Date().toISOString()
		});
	} catch (error) {
		console.error("Hesap silme hatası:", error);
		res.status(500).json({ message: "Hesap silinirken hata oluştu", error: error.message });
	}
};
