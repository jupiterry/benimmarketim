import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { sendToN8N } from "../services/n8n.service.js";

const generateTokens = (userId) => {
	const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "15m",
	});

	const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: "7d",
	});

	return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
	await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 7 * 24 * 60 * 60); // 7days
};

const setCookies = (res, accessToken, refreshToken) => {
	res.cookie("accessToken", accessToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
		maxAge: 15 * 60 * 1000, // 15 minutes
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
		maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
		const user = await User.create({ name, email, password, phone, deviceType });
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

		if (user && (await user.comparePassword(password))) {
			// Update device type if provided
			if (deviceType) {
				user.lastDeviceType = user.deviceType;
				user.deviceType = deviceType;
				await user.save();
			}
			
			const { accessToken, refreshToken } = generateTokens(user._id);
			await storeRefreshToken(user._id, refreshToken);
			setCookies(res, accessToken, refreshToken);

			console.log("Login successful, tokens generated"); // Debug log

			res.json({
				_id: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
				accessToken: accessToken, // Flutter için token'ı response'da gönder
				refreshToken: refreshToken // Flutter için refresh token'ı da gönder
			});
		} else {
			res.status(400).json({ message: "Geçersiz E-posta veya Şifre" });
		}
	} catch (error) {
		console.log("Error in login controller", error.message);
		res.status(500).json({ message: error.message });
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

		const accessToken = jwt.sign({ userId: decoded.userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });

		// Cookie'yi de güncelle
		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 15 * 60 * 1000,
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
